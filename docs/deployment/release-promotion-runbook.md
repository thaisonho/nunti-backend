# Release Promotion and Rollback Runbook

## 1. Staging Deployment

Staging deployments occur automatically when a release tag is pushed to the repository.

- **Workflow Name**: `Release Deploy` (`.github/workflows/release-deploy.yml`)
- **Trigger**: Push a tag matching `v*` (e.g., `git tag v1.0.0 && git push origin v1.0.0`)
- **Action**: Packages the SAM template, deploys to staging environments, and uploads the immutable `release-manifest.json` and `packaged.yaml` as release-manifest artifacts.

### Required Repo Variable for Live Smoke Test

- `PRODUCTION_HEALTHCHECK_URL`: HTTPS URL checked immediately after production promotion (example: `https://api.nunti.jsonho.com/health`)

This variable is required by the promotion workflow. Promotion fails if it is missing or unhealthy.

---

## 2. Production Promotion

Production follows an immutable artifact promotion model. Deployments reuse exactly what was successfully deployed in staging.

- **Workflow Name**: `Release Promote` (`.github/workflows/release-promote.yml`)
- **Trigger**: Manual via GitHub Actions UI (`workflow_dispatch`)
- **Required Inputs**:
  - `releaseVersion`: The exact release tag version deployed to staging (e.g., `v1.0.0`)
- **Action**: Downloads the artifact from the Staging Deployment run, validates its checksums (`templateSha256` and `releaseVersion`), and deploys it to the production environment without rebuilding the code.

### TLS Requirement for Custom Production Domain

If you route `ProductionDomainName` to CloudFront, set `ProductionCloudFrontCertificateArn` in [deploy/params.production.json](deploy/params.production.json) to a valid ACM certificate ARN in `us-east-1` that covers the production domain.

Without this certificate, HTTPS clients fail hostname verification and live smoke tests fail.

---

## 3. Explicit Rollback

In the event of an anomaly in any environment, operators can revert exclusively to previously approved and tested manifest artifacts.

- **Workflow Name**: `Release Rollback` (`.github/workflows/release-rollback.yml`)
- **Trigger**: Manual via GitHub Actions UI (`workflow_dispatch`)
- **Required Inputs**:
  - `targetEnvironment`: Select `staging` or `production`
  - `releaseVersion`: Select a previous known-good and built tag version
- **Action**: Retrieves the older manifest and packaged template associated with the `releaseVersion` tag, conducts provenance checks, and reapplies that deployment configuration. Rollback metrics and checksums are logged within the job summary.
