#!/bin/bash
set -e

# setup-oidc-s3.sh
# Scaffolds AWS infrastructure for Nunti CI/CD

GITHUB_ORG="thaisonho"
GITHUB_REPO="nunti-backend"
ARTIFACT_BUCKET="nunti-artifacts-${GITHUB_ORG}-${GITHUB_REPO}" # Make it globally unique
REGION="ap-southeast-1"
ROLE_NAME="github-actions-deploy-role"

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

echo "3. Creating IAM Role for GitHub Actions..."
cat > trust-policy.json <<EOF
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
                    "token.actions.githubusercontent.com:sub": "repo:${GITHUB_ORG}/${GITHUB_REPO}:*"
                }
            }
        }
    ]
}
EOF

if aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
    echo "Role $ROLE_NAME already exists. Updating trust policy..."
    aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document file://trust-policy.json
else
    aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document file://trust-policy.json
fi
rm trust-policy.json

echo "4. Attaching Required Policies to the Role..."
# Attach managed policies or create inline policy for SAM deployment.
aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn "arn:aws:iam::aws:policy/AdministratorAccess"
# Note: For production use, it's highly recommended to scope this down to least privilege!
# AdministratorAccess is used here for brevity when deploying SAM Applications containing unpredicted resources.

ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

echo ""
echo "=== SETUP COMPLETE ==="
echo "AWS_REGION: $REGION"
echo "AWS_OIDC_ROLE_ARN: $ROLE_ARN"
echo "ARTIFACT_BUCKET: $ARTIFACT_BUCKET"
echo ""
echo "Please add AWS_OIDC_ROLE_ARN to your GitHub Repository Secrets."
echo "Please add AWS_REGION to your GitHub Repository Variables (or Secrets)."
