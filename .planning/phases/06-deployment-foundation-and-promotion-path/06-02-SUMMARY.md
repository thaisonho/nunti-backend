---
phase: 06-deployment-foundation-and-promotion-path
plan: 02
subsystem: infra
tags: [deployment, promotion, rollback, github-actions, sam]

# Dependency graph
requires:
  - phase: 06-deployment-foundation-and-promotion-path
    provides: [immutable staging release manifest and packaged SAM template]
provides:
  - [github action workflow for explicit promotion]
  - [github action workflow for explicit rollback]
  - [scripts that validate release manifest provenance before executing sam deploy]
  - [deployment runbook]
affects: [operations]

# Tech tracking
tech-stack:
  added: []
  patterns: [manifest-driven promotion, artifact pointers]

key-files:
  created: [.github/workflows/release-promote.yml, .github/workflows/release-rollback.yml, scripts/deploy/promote-release.sh, scripts/deploy/rollback-release.sh, docs/deployment/release-promotion-runbook.md]
  modified: [.github/workflows/release-deploy.yml]

key-decisions:
  - "Modified release-deploy.yml to also upload packaged.yaml as part of artifact to ensure manifest-driven promotion without rebuilding has access to the SAM template."

patterns-established:
  - "Immutable promotion: verify manifest version/SHA, point to same packaged SAM template, trigger deploy directly."

requirements-completed:
  - DEP-02

# Metrics
duration: 8 min
completed: 2026-04-03
---

# Phase 06 Plan 02: Promotion Path Summary

**Immutable production promotion and rollback workflows utilizing release-manifest provenance checks**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-03T04:03:58Z
- **Completed:** 2026-04-03T04:08:24Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Implemented promotion workflow and script referencing staging-approved manifest artifacts, bypassing any rebuilding stages.
- Implemented explicit rollback workflows and scripts reverting to any prior target manifest version to restore a validated deployment instance securely.
- Documented workflows in an explicit deployment runbook for operational guidance.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add manifest-driven production promotion with provenance checks** - `47f82b2` (feat)
2. **Task 2: Implement explicit rollback workflow and operator runbook** - `9e5e786` (feat)


## Files Created/Modified
- `scripts/deploy/promote-release.sh` - Checks provenance and deploys to production stack.
- `.github/workflows/release-promote.yml` - Manual dispatch workflow to download staging artifacts and promote.
- `scripts/deploy/rollback-release.sh` - Identical signature verifying selected release artifact and invoking deployment.
- `.github/workflows/release-rollback.yml` - Manual dispatch specifying target environment and release version returning rollout status.
- `docs/deployment/release-promotion-runbook.md` - Documentation enumerating operational expectations.
- `.github/workflows/release-deploy.yml` - Adjusted artifact upload paths to securely forward packaged.yaml configuration.

## Decisions Made
- Adjusted `.github/workflows/release-deploy.yml` to ensure `packaged.yaml` propagates with `release-manifest.json` as it's structurally required for manifest deployments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Modified Staging Action to upload packaged template**
- **Found during:** Task 1 (Add manifest-driven production promotion with provenance checks)
- **Issue:** Promoting required skipping builds per the plan's `<action>` block, ensuring exact staging templates are matched to SHA256 constraints. But `.github/workflows/release-deploy.yml` previously only exported `release-manifest.json` lacking the matching `packaged.yaml`.
- **Fix:** Appended `packaged.yaml` to upload paths.
- **Files modified:** `.github/workflows/release-deploy.yml`
- **Verification:** Action will cache correct packaged SAM configuration permitting workflow downloading.
- **Committed in:** `47f82b2` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Critical fix to ensure artifact-driven deployment is mathematically sound and executable.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Deployment foundation completely instantiated bridging development directly through production environments reliably.

---
*Phase: 06-deployment-foundation-and-promotion-path*
*Completed: 2026-04-03*
