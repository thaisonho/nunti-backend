# Production Cognito Setup Guide

## Overview

Production Cognito User Pool is completely separate from staging and enforces stricter authentication policies:

| Policy | Staging | Production | Rationale |
|--------|---------|------------|-----------|
| Password Min Length | 8 | 12 | Industry standard for production |
| Uppercase Required | No | Yes | Increases entropy |
| Lowercase Required | No | Yes | Increases entropy |
| Numbers Required | No | Yes | Increases entropy |
| Symbols Required | No | Yes | Increases entropy |
| MFA | Optional | Required | Prevents account takeover |
| Device Recognition | No | Yes | Detects unauthorized sign-ins |
| Token Expiry (Access) | 24h | 1h | Reduces leaked token window |
| Token Expiry (Refresh) | 90d | 30d | Shorter session lifetime |

## Initial Setup

### 1. Deploy Production Stack with Cognito

First deployment of template.yaml will create a new Cognito User Pool:

```bash
./scripts/deploy/deploy-stage.sh production
```

This will:
- Create `nunti-production-user-pool` User Pool
- Create `nunti-production-app` App Client
- Output User Pool ID and App Client ID as CloudFormation exports

### 2. Capture Cognito IDs

After successful SAM deployment, retrieve the IDs:

```bash
aws cloudformation describe-stacks \
  --stack-name nunti-backend-production \
  --query 'Stacks[0].Outputs[?OutputKey==`ProductionCognitoUserPoolId`].OutputValue' \
  --output text
```

Output will be: `us-east-1_XXXXXXXXX`

Save this value as `PROD_COGNITO_USER_POOL_ID` in GitHub Actions secrets for future deployments.

### 3. Store in GitHub Actions Secrets

Update your GitHub repository secrets:
- `PROD_COGNITO_USER_POOL_ID` = `us-east-1_XXXXXXXXX`
- `PROD_COGNITO_APP_CLIENT_ID` = `abcd1234efgh5678ijkl9012` (find in AWS Cognito Console)

These are used in `.github/workflows/release-deploy.yml` to populate params.production.json.

## User Creation and Testing

### Create Test User

```bash
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser@example.com \
  --message-action SUPPRESS \
  --temporary-password TempPassword123!
```

### Set Permanent Password

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser@example.com \
  --password ProductionPassword123! \
  --permanent
```

### Enable MFA (if required)

```bash
aws cognito-idp admin-set-user-mfa-preference \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser@example.com \
  --software-token-mfa-settings Enabled true SetAsPreferred true
```

## Password Policy Enforcement

Production Cognito requires:
- **Minimum 12 characters** (no exceptions)
- **At least one uppercase letter** (A-Z)
- **At least one lowercase letter** (a-z)
- **At least one number** (0-9)
- **At least one special character** (!@#$%^&*)

Example valid password: `MyApp@2024Prod!`

Example invalid password: `production123` (no uppercase, symbols)

## MFA Setup

### Software Token MFA (TOTP)

Users authenticate with Time-based One-Time Password (TOTP) apps:
- Google Authenticator
- Microsoft Authenticator
- Authy

When disabled, users can still use SMS MFA if registered.

### SMS MFA

Requires user to have verified phone number in User Pool:

```bash
aws cognito-idp admin-update-user-attributes \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser@example.com \
  --user-attributes Name=phone_number,Value=+12025551234
```

## Device Configuration

Production Cognito tracks devices and requires challenges:
- First sign-in from new device → device challenge
- Existing device → seamless sign-in
- Device recognition prevents account takeover from new locations

Users can manage trusted devices in app settings (Phase 12+).

## Account Recovery

If user forgets password:

1. **Verified Email** (Primary recovery method)
   - User clicks "Forgot Password" → receives verification code to email
   - Enters code + new password in auth flow
   
2. **Verified Phone Number** (Secondary)
   - If email not verified, SMS sent to phone
   - User enters SMS code to reset password

## Monitoring and Troubleshooting

### Check User Pool Health

```bash
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_XXXXXXXXX \
  --query 'UserPool.[Id, Name, Status, UserAttributeUpdateSettings]'
```

### List All Users

```bash
aws cognito-idp list-users \
  --user-pool-id us-east-1_XXXXXXXXX
```

### Check User Attributes

```bash
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser@example.com
```

### Reset MFA (Emergency)

If user loses access to MFA device:

```bash
aws cognito-idp admin-delete-user-attributes \
  --user-pool-id us-east-1_XXXXXXXXX \
  --username testuser@example.com \
  --user-attribute-names 'software_2fa_enabled'
```

User will need to set up MFA again on next login.

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Password does not conform to policy" | Missing uppercase, symbols, or number | Ensure password has all 4 types: uppercase, lowercase, number, symbol (min 12 chars) |
| "User account is locked" | Too many failed sign-in attempts | Wait 15 minutes or contact operator to unlock |
| "MFA challenge failed" | TOTP code expired (only valid 30 seconds) | Re-enter new code or use backup codes |
| "Device not recognized" | New device signing in for first time | Complete device challenge (code sent to email/phone) |

## Disaster Recovery

If Cognito User Pool is compromised or accidentally deleted:

1. **Emergency:** Disable Lambda functions (set concurrency to 0)
2. **Restore:** Create new pool from template or restore snapshot (if available)
3. **Migrate:** For user data, export user attributes via `admin-list-user-auth-events`
4. **Re-deploy:** Update GitHub Actions secret with new pool ID and redeploy

Note: User passwords are NOT recoverable from backups; users must reset via email verification.

## Phase 11 Enhancements

Operations Readiness (Phase 11) will add:
- Automated user provisioning via SCIM
- Custom auth flows for device-specific verification
- Integration with external IdP providers (OIDC, SAML)
- User audit logging to CloudWatch
- Cognito event webhooks for custom workflows
