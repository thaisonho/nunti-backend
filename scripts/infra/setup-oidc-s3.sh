#!/bin/bash
set -e

# setup-oidc-s3.sh
# Scaffolds AWS infrastructure for Nunti CI/CD
#
# Creates environment-specific deploy roles with constrained OIDC trust.
# Normal bootstrap path does NOT grant AdministratorAccess.
# Use ATTACH_ADMIN_ACCESS=true only for break-glass scenarios.
#
# Usage:
#   # Staging (default):
#   DEPLOY_ENV=staging ./setup-oidc-s3.sh
#
#   # Production:
#   DEPLOY_ENV=production ./setup-oidc-s3.sh
#
#   # Break-glass (attach AdministratorAccess):
#   ATTACH_ADMIN_ACCESS=true DEPLOY_ENV=staging ./setup-oidc-s3.sh

GITHUB_ORG="${GITHUB_ORG:-${1:-thaisonho}}"
GITHUB_REPO="${GITHUB_REPO:-${2:-nunti-backend}}"
DEPLOY_ENV="${DEPLOY_ENV:-staging}"
ARTIFACT_BUCKET="nunti-artifacts-${GITHUB_ORG}-${GITHUB_REPO}" # Make it globally unique
REGION="${REGION:-ap-southeast-1}"
ATTACH_ADMIN_ACCESS="${ATTACH_ADMIN_ACCESS:-false}"

# Environment-specific role names
if [ "$DEPLOY_ENV" = "production" ]; then
    ROLE_NAME="${ROLE_NAME:-github-actions-deploy-role-prod}"
else
    ROLE_NAME="${ROLE_NAME:-github-actions-deploy-role}"
fi

echo "============================================"
echo "Environment: ${DEPLOY_ENV}"
echo "Role:        ${ROLE_NAME}"
echo "============================================"

echo "1. Creating S3 Bucket for SAM deployment artifacts..."
if aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null; then
    echo "Bucket $ARTIFACT_BUCKET already exists."
else
    aws s3api create-bucket \
      --bucket "$ARTIFACT_BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"

    aws s3api put-public-access-block \
      --bucket "$ARTIFACT_BUCKET" \
      --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    
    aws s3api put-bucket-versioning \
      --bucket "$ARTIFACT_BUCKET" \
      --versioning-configuration Status=Enabled
    echo "Created bucket $ARTIFACT_BUCKET"
fi

echo "2. Setting up GitHub OIDC Provider..."
OIDC_ARN_CHECK=$(aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[?contains(Arn, `token.actions.githubusercontent.com`)].Arn' --output text)

if [ "$OIDC_ARN_CHECK" == "" ] || [ "$OIDC_ARN_CHECK" == "[]" ]; then
    echo "Creating OIDC Provider..."
    THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1" # Standard GitHub Actions OIDC Thumbprint
    aws iam create-open-id-connect-provider \
      --url "https://token.actions.githubusercontent.com" \
      --client-id-list "sts.amazonaws.com" \
      --thumbprint-list "$THUMBPRINT"
    
    OIDC_ARN=$(aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[?contains(Arn, `token.actions.githubusercontent.com`)].Arn' --output text)
else
    OIDC_ARN=$(echo $OIDC_ARN_CHECK | awk '{print $1}')
    echo "OIDC Provider already exists: $OIDC_ARN"
fi

echo "3. Creating IAM Role for GitHub Actions (${DEPLOY_ENV})..."
TRUST_POLICY_FILE=$(mktemp)
trap 'rm -f "$TRUST_POLICY_FILE"' EXIT

# Constrained OIDC trust: only release workflows / release tags
# Staging: triggered by tag pushes (release-deploy.yml on v* tags)
# Production: triggered by release-promote.yml and release-rollback.yml workflows
if [ "$DEPLOY_ENV" = "production" ]; then
    # Production role: only allow assumption from promote and rollback workflows
    cat > "$TRUST_POLICY_FILE" <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "${OIDC_ARN}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": [
                        "repo:${GITHUB_ORG}/${GITHUB_REPO}:environment:production",
                        "repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/tags/v*"
                    ]
                }
            }
        }
    ]
}
EOF
else
    # Staging role: triggered by tag pushes
    cat > "$TRUST_POLICY_FILE" <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "${OIDC_ARN}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:ref:refs/tags/v*"
                }
            }
        }
    ]
}
EOF
fi

if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
    echo "Role $ROLE_NAME already exists. Updating trust policy..."
    aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "file://$TRUST_POLICY_FILE"
else
    aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "file://$TRUST_POLICY_FILE"
fi

echo "4. Attaching Required Policies to the Role..."
if [ "$ATTACH_ADMIN_ACCESS" = "true" ]; then
    echo "⚠️  BREAK-GLASS: Attaching AdministratorAccess because ATTACH_ADMIN_ACCESS=true."
    echo "   This is intended for emergency recovery only. Remove when done."
    aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess"
else
    echo "Skipping AdministratorAccess (normal bootstrap path)."
    echo "Set ATTACH_ADMIN_ACCESS=true only for break-glass scenarios."
fi

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

echo ""
echo "=== SETUP COMPLETE ==="
echo "Environment:     $DEPLOY_ENV"
echo "AWS_REGION:      $REGION"
echo "ROLE_NAME:       $ROLE_NAME"
echo "AWS_OIDC_ROLE_ARN: $ROLE_ARN"
echo "ARTIFACT_BUCKET: $ARTIFACT_BUCKET"
echo ""
if [ "$DEPLOY_ENV" = "production" ]; then
    echo "Please add AWS_OIDC_ROLE_ARN_PROD=$ROLE_ARN to your GitHub Repository Secrets."
else
    echo "Please add AWS_OIDC_ROLE_ARN=$ROLE_ARN to your GitHub Repository Secrets."
fi
echo "Please add AWS_REGION to your GitHub Repository Variables (or Secrets)."
