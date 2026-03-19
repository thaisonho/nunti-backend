---
phase: 2
slug: identity-and-device-access
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 |
| **Config file** | `vitest.config.ts` (Wave 0 installs) |
| **Quick run command** | `npm run test:auth` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:auth`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 0 | AUTH-01 | integration + unit | `npm run test:auth -- tests/integration/auth-signin-signup.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 0 | AUTH-02 | integration + unit | `npm run test:auth -- tests/unit/auth-guard.test.ts tests/integration/protected-route-auth.test.ts` | ❌ W0 | ⬜ pending |
| 2-01-03 | 01 | 0 | AUTH-03 | integration + unit | `npm run test:auth -- tests/unit/device-service.test.ts tests/integration/devices-flow.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/auth-guard.test.ts` — claim and token error-path matrix for AUTH-02
- [ ] `tests/unit/auth-error-mapper.test.ts` — stable machine code + status mapping
- [ ] `tests/unit/device-service.test.ts` — register/revoke state transitions for AUTH-03
- [ ] `tests/integration/protected-route-auth.test.ts` — valid vs invalid JWT behavior on protected route
- [ ] `tests/integration/devices-flow.test.ts` — multi-device register/list/revoke behavior
- [ ] `vitest.config.ts` — test setup and path aliases
- [ ] `npm install -D vitest @types/aws-lambda` — framework install and types

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cognito-hosted email verification delivery/UX timing | AUTH-01 | Depends on external AWS-managed delivery channels and account configuration | Run signup in a sandbox user pool, verify confirmation delivery, verify resend cooldown messaging and generic errors in API output. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
