# Release Promotion and Rollback Runbook

## 1. Staging Deploy
When a new version tag (`v*`) is pushed, `.github/workflows/release-deploy.yml` triggers automatically. It packages the artifact once and deploys to staging using SAM parameters.

## 2. Production Promote
To release to production, ensure staging validations passed. We reuse the exact staging artifact, performing no rebuild.
- Go to GitHub Actions -> "Promote Release to Production" (`release-promote.yml`).
- Use `workflow_dispatch` button.
- Provide the `releaseVersion` matching the staging-approved tag.

## 3. Rollback
When an explicit artifact-based rollback is required:
- Go to GitHub Actions -> "Explicit Release Rollback" (`release-rollback.yml`).
- Use the `workflow_dispatch` button.
- Provide `targetEnvironment` (`staging` or `production`).
- Provide the `releaseVersion` of the previous approved release.
- Verifies the immutable templateSha256 from the manifest and safely reverts to that version.
