---
status: testing
phase: 06-deployment-foundation-and-promotion-path
source: [.planning/phases/06-deployment-foundation-and-promotion-path/06-01-SUMMARY.md, .planning/phases/06-deployment-foundation-and-promotion-path/06-02-SUMMARY.md]
started: 2026-04-03T04:13:58Z
updated: 2026-04-08T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 2
name: Deploy Staging From Artifact
expected: |
  Running scripts/deploy/deploy-stage.sh deploys staging from the packaged artifact and explicit parameter file,
  without rebuilding templates, and completes with a successful SAM deploy result.
awaiting: user response

## Tests

### 1. Package Immutable Release Artifact
expected: Running scripts/deploy/package-release.sh for staging produces a release artifact directory containing release-manifest.json and packaged.yaml. The manifest version/SHA values are present and the artifact can be consumed without rebuilding source code.
result: pass

### 2. Deploy Staging From Artifact
expected: Running scripts/deploy/deploy-stage.sh deploys staging from the packaged artifact and explicit parameter file, without rebuilding templates, and completes with a successful SAM deploy result.
result: [pending]

### 3. Tag-Triggered Staging Workflow
expected: Creating a v* tag triggers .github/workflows/release-deploy.yml, and workflow artifacts include both release-manifest.json and packaged.yaml from the same release build.
result: [pending]

### 4. Manual Production Promotion Workflow
expected: Manually dispatching .github/workflows/release-promote.yml for an approved release version validates manifest provenance and promotes that exact packaged artifact to production.
result: [pending]

### 5. Manual Rollback Workflow
expected: Manually dispatching .github/workflows/release-rollback.yml with a prior release version validates the selected manifest and deploys rollback to the target environment successfully.
result: [pending]

### 6. Runbook Operational Clarity
expected: docs/deployment/release-promotion-runbook.md provides complete, executable operator steps for promotion and rollback that match workflow inputs and scripts.
result: [pending]

## Summary

total: 6
passed: 1
issues: 0
pending: 5
skipped: 0

## Gaps

[none yet]
