---
phase: 06
slug: deployment-foundation-and-promotion-path
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-03
---

# Phase 06 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + shell verification |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~45-90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` and the task-specific verify command from PLAN.md.
- **After every plan wave:** Run `npm test`.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 90 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | DEP-01 | static + build | `npm run build && rg "AWS::Serverless::Function|STAGE|DEVICES_TABLE_NAME|MESSAGES_TABLE_NAME" template.yaml deploy/params.staging.json deploy/params.production.json` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | DEP-01 | workflow integrity | `rg "on:\n  push:\n    tags|sam package|sam deploy|release-manifest.json" .github/workflows/release-deploy.yml` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | DEP-02 | provenance gate | `rg "workflow_dispatch|releaseVersion|templateSha256|promote|no rebuild" .github/workflows/release-promote.yml scripts/deploy/promote-release.sh` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 2 | DEP-02 | rollback path | `rg "rollback|previous approved|releaseVersion" .github/workflows/release-rollback.yml scripts/deploy/rollback-release.sh docs/deployment/release-promotion-runbook.md` | ✅ | ⬜ pending |

*Status: ⬜ pending, ✅ green, ❌ red, ⚠ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Trigger production promotion after staging approval | DEP-02 | Requires controlled environment selection and release approval context | Run workflow dispatch for a test tag in sandbox and confirm production stack uses the same manifest digest as staging |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity keeps feedback per task.
- [x] Wave 0 dependencies are not required.
- [x] No watch-mode flags.
- [x] Feedback latency target < 90s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
