# Quick Task: Setup AWS infrastructure for phase 6 UAT

## Objective
Setup AWS infrastructure for phase 6 UAT by establishing OIDC authentication for GitHub Actions, creating scripts for IAM Role/S3 bucket setup, and documenting required variables.

## Execution Details
- **Phase:** quick
- **Status:** completed
- **Date:** 2026-04-07

## Tasks Completed
1. **Create infrastructure setup script:**
   - Created `scripts/infra/setup-oidc-s3.sh` to fully configure the S3 Artifact Bucket, GitHub OIDC Provider, and attach an IAM Role (`github-actions-deploy-role`) with `AdministratorAccess` (ready for tuning).
2. **Update GitHub Actions to use OIDC:**
   - Replaced all static AWS credentials in `.github/workflows/release-deploy.yml`, `release-promote.yml`, and `release-rollback.yml` with `role-to-assume` and added the `permissions: id-token: write` blocks.
3. **Document Required Variables and Secrets:**
   - Created `docs/deployment/environment-configs.md` documenting required secrets (`AWS_OIDC_ROLE_ARN`) and variables (`AWS_REGION`).

## Deviations
None. The workflows now support secure AWS OIDC Federation.

## Output
Infrastructure generation script, upgraded deployment workflows without static AWS access keys, and clear setup documentation.