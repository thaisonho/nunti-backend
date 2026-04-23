# Environment Configurations

This document outlines the required Environment Variables, GitHub Secrets, and the role-bootstrap process for the CI/CD pipeline infrastructure.

## Overview

The workflows (`release-deploy.yml`, `release-promote.yml`, `release-rollback.yml`) use OpenID Connect (OIDC) to authenticate with AWS. This eliminates the need for long-lived AWS IAM User Access Keys.

**Security model:** Staging and production use **separate IAM roles** with constrained OIDC trust policies. The normal bootstrap path does **not** grant `AdministratorAccess`.

## Role Architecture

| Role | Name | Purpose | OIDC Subject Constraint |
| --- | --- | --- | --- |
| Staging | `github-actions-deploy-role` | Tag-triggered deployments via `release-deploy.yml` | `repo:{org}/{repo}:ref:refs/tags/v*` |
| Production | `github-actions-deploy-role-prod` | Manual promotions and rollbacks via `release-promote.yml`, `release-rollback.yml` | `repo:{org}/{repo}:environment:production` + tag refs |

### Which workflow uses which role?

| Workflow | Secret Used | When |
| --- | --- | --- |
| `release-deploy.yml` | `AWS_OIDC_ROLE_ARN` | Automatic on `v*` tag push |
| `release-promote.yml` | `AWS_OIDC_ROLE_ARN_PROD` | Manual dispatch for production promotion |
| `release-rollback.yml` | Environment-aware: `AWS_OIDC_ROLE_ARN_PROD` for production, `AWS_OIDC_ROLE_ARN` for staging | Manual dispatch |

## Running the Setup Script

### Staging bootstrap

```bash
chmod +x scripts/infra/setup-oidc-s3.sh
# Ensure you are authenticated to AWS CLI with sufficient permissions
DEPLOY_ENV=staging ./scripts/infra/setup-oidc-s3.sh
```

### Production bootstrap

Run in the production AWS account (or same account with separate role):

```bash
DEPLOY_ENV=production ./scripts/infra/setup-oidc-s3.sh
```

### What the script creates

1. An S3 Artifact Bucket with versioning (e.g., `nunti-artifacts-thaisonho-nunti-backend`).
2. The GitHub OpenID Connect Identity Provider in AWS IAM (shared across environments).
3. An environment-specific IAM role with constrained OIDC trust policy.

### Break-glass access

For emergency scenarios requiring broad permissions:

```bash
ATTACH_ADMIN_ACCESS=true DEPLOY_ENV=staging ./scripts/infra/setup-oidc-s3.sh
```

**⚠️ This attaches `AdministratorAccess` to the role. Remove it when the emergency is resolved.**

---

## 1. GitHub Variables

Configure these at the repository or environment level (Settings > Secrets and variables > Actions > Variables).

| Variable Name | Required | Description |
| --- | --- | --- |
| `AWS_REGION` | Yes | The AWS Region for deployment (e.g., `ap-southeast-1`). |

---

## 2. GitHub Secrets

Configure these at the repository or environment level (Settings > Secrets and variables > Actions > Secrets).

| Secret Name | Required | Description |
| --- | --- | --- |
| `AWS_OIDC_ROLE_ARN` | Yes | ARN of the staging deploy role. Output by the bootstrap script with `DEPLOY_ENV=staging`. |
| `AWS_OIDC_ROLE_ARN_PROD` | Yes (for production) | ARN of the production deploy role. Output by the bootstrap script with `DEPLOY_ENV=production`. |

**Important:** Repository parameter JSON files (`deploy/params.staging.json`, `deploy/params.production.json`) are committed as placeholders. They contain no secret values — only parameter names and stack configuration.

---

## 3. Local Development

For local runs of `scripts/deploy/package-release.sh` or `deploy-stage.sh`, ensure you are authenticated with AWS.

Set the `ARTIFACT_BUCKET` locally if it differs from the default:

```bash
export ARTIFACT_BUCKET=nunti-artifacts-thaisonho-nunti-backend
```

Ensure `deploy/params.staging.json` exists and is configured with the real parameter override values required for your environment before running scripts successfully.

---

## 4. Production Network Architecture

Production uses a dedicated VPC (10.1.0.0/16) isolated from staging with least-privilege security groups.

For the full production networking documentation, see: [Production Network Architecture](./production-network-architecture.md)

Key highlights:
- **VPC Isolation:** Separate CIDR block (10.1.0.0/16) with 2 private subnets + 1 public subnet
- **NAT Gateway:** Lambda egress control without direct internet exposure
- **Security Groups:** Lambda → DynamoDB restricted to HTTPS on DynamoDB subnet CIDR only
- **Multi-AZ:** Private subnets span 2 availability zones for resilience

---

## 5. Group HTTP endpoints deployment checklist

When wiring the group management HTTP endpoints in API Gateway, keep these values aligned:

| Route | Lambda Function |
| --- | --- |
| `POST /v1/groups` | `nunti-http-groups-create` |
| `GET /v1/groups/{groupId}` | `nunti-http-groups-get` |
| `GET /v1/groups/{groupId}/members` | `nunti-http-groups-members-list` |
| `POST /v1/groups/{groupId}/members` | `nunti-http-groups-members-add` |
| `DELETE /v1/groups/{groupId}/members/{userId}` | `nunti-http-groups-members-remove` |
| `POST /v1/groups/{groupId}/leave` | `nunti-http-groups-leave` |

Required Lambda handler pattern (same as existing HTTP handlers):

```text
dist/src/handlers/http/<file>.handler
```

For the routes above, use:
- `dist/src/handlers/http/groups-create.handler`
- `dist/src/handlers/http/groups-get.handler`
- `dist/src/handlers/http/groups-members-list.handler`
- `dist/src/handlers/http/groups-members-add.handler`
- `dist/src/handlers/http/groups-members-remove.handler`
- `dist/src/handlers/http/groups-leave.handler`

HTTP API integration setting:
- **Payload format version:** `1.0`

---

## 6. Auth HTTP endpoints deployment checklist

When wiring auth endpoints in API Gateway, use these routes and handler entrypoints:

| Route | Lambda Handler |
| --- | --- |
| `POST /v1/auth/signup` | `dist/src/handlers/http/auth-signup.handler` |
| `POST /v1/auth/verify-email` | `dist/src/handlers/http/auth-verify-email.handler` |
| `POST /v1/auth/signin` | `dist/src/handlers/http/auth-signin.handler` |
| `POST /v1/auth/resend-verification` | `dist/src/handlers/http/auth-resend-verification.handler` |

HTTP API integration settings:
- **Integration type:** Lambda proxy
- **Payload format version:** `1.0`

---

## 7. Device and User HTTP endpoints deployment checklist

When wiring device and user endpoints in API Gateway, use these routes and handler entrypoints:

| Route | Lambda Handler | Notes |
| --- | --- | --- |
| `POST /v1/devices/register` | `dist/src/handlers/http/devices-register.handler` | Register new device |
| `GET /v1/devices` | `dist/src/handlers/http/devices-list.handler` | List own devices |
| `POST /v1/devices/{deviceId}/revoke` | `dist/src/handlers/http/devices-revoke.handler` | Revoke device |
| `PUT /v1/devices/{deviceId}/keys` | `dist/src/handlers/http/devices-keys.handler` | Upload E2EE keys |
| `GET /v1/users/{userId}/devices` | `dist/src/handlers/http/users-devices-list.handler` | **NEW** - List another user's devices |
| `GET /v1/users/{userId}/devices/{deviceId}/bootstrap` | `dist/src/handlers/http/devices-bootstrap.handler` | Fetch key bundle for E2EE |
| `GET /v1/users/search` | `dist/src/handlers/http/users-search.handler` | Search users by email |

HTTP API integration settings:
- **Integration type:** Lambda proxy
- **Payload format version:** `1.0`

**Important for Signal Protocol E2EE:**
- The `GET /v1/users/{userId}/devices` endpoint is required for device discovery
- The bootstrap endpoint now allows cross-user key fetching (authorization fix applied)
