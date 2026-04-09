---
phase: 07-security-hardening-for-live-runtime
plan: 01
subsystem: infra
tags: [iam, oidc, sam, least-privilege, deployment, aws]

# Dependency graph
requires:
  - phase: 06-deployment-foundation-and-promotion-path
    provides: [release-deploy, release-promote, release-rollback workflows and bootstrap script]
provides:
  - [environment-split IAM roles with constrained OIDC trust]
  - [least-privilege runtime IAM policy in SAM template]
  - [operator documentation for the new role model]
affects: [deployment, operations]

# Tech tracking
tech-stack:
  added: []
  patterns: [environment-specific deploy roles, constrained OIDC subject trust, least-privilege SAM policies]

key-files:
  created: []
  modified:
    - scripts/infra/setup-oidc-s3.sh
    - .github/workflows/release-promote.yml
    - template.yaml
    - docs/deployment/environment-configs.md

key-decisions:
  - "Staging and production use separate IAM roles — staging: github-actions-deploy-role, production: github-actions-deploy-role-prod."
  - "OIDC trust constrained to tag refs for staging, production environment + tag refs for production role."
  - "AdministratorAccess removed from normal bootstrap — break-glass only via ATTACH_ADMIN_ACCESS=true."

patterns-established:
  - "Environment-specific IAM: DEPLOY_ENV flag controls which role is created and which OIDC subjects are trusted."
  - "Scoped runtime IAM: DynamoDB table-level, WebSocket execute-api, CloudWatch only."

requirements-completed:
  - SEC-01

# Metrics
duration: 6 min
completed: 2026-04-09
---

# Phase 07 Plan 01: IAM & Deployment Role Separation Summary

**Environment-split OIDC deploy roles, constrained trust policies, and explicit least-privilege runtime IAM in the SAM template**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-09T03:44:00Z
- **Completed:** 2026-04-09T03:52:30Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Separated staging and production IAM deploy roles with distinct OIDC trust subjects
- Removed AdministratorAccess from the normal bootstrap path with explicit break-glass documentation
- Encoded least-privilege runtime IAM in template.yaml scoped to DynamoDB tables, WebSocket management, and CloudWatch
- Updated operator documentation to reflect the new role architecture and workflow-role mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Split deploy-role bootstrap and workflow credentials** - `15677ed` (feat)
2. **Task 2: Encode least-privilege runtime IAM in SAM template** - `5c9e71e` (feat)
3. **Task 3: Update operator documentation for the role split** - `672947e` (docs)

## Files Created/Modified
- `scripts/infra/setup-oidc-s3.sh` - Environment-aware OIDC bootstrap with constrained trust
- `.github/workflows/release-promote.yml` - Now uses AWS_OIDC_ROLE_ARN_PROD for production
- `template.yaml` - Least-privilege IAM policies for DynamoDB, WebSocket, and CloudWatch
- `docs/deployment/environment-configs.md` - Operator guide for the new role split and break-glass

## Decisions Made
- Constrained OIDC trust subjects: staging role only accepts tag refs, production role accepts environment:production and tag refs
- Runtime IAM in template.yaml includes explicit ConnectionsTableName parameter for WebSocket connection tracking
- Added Stage AllowedValues constraint in SAM template to prevent accidental misuse

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Deployment IAM fully hardened. Ready for Plan 02: production-safe runtime auth, secrets, and log defaults.

---
*Phase: 07-security-hardening-for-live-runtime*
*Completed: 2026-04-09*
