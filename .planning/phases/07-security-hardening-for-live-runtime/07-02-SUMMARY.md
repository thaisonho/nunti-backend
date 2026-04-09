---
phase: 07-security-hardening-for-live-runtime
plan: 02
subsystem: auth
tags: [jwt, secrets-manager, logging, websockets]

# Dependency graph
requires:
  - phase: 06-deployment-foundation-and-promotion-path
    provides: [runtime foundation]
provides:
  - [route-aware dual-token JWT verification]
  - [production-safe header-only WS auth constraint]
  - [fail-closed AWS Secrets Manager integration]
  - [redacted log metadata payloads for warning events]
affects: [security, operations]

# Tech tracking
tech-stack:
  added: [@aws-sdk/client-secrets-manager, crypto]
  patterns: [cached secrets manager fallback, test timer faking for retention bounds]

key-files:
  created:
    - src/app/secret-store.ts
    - src/realtime/log-redact.ts
  modified:
    - src/auth/jwt-verifier.ts
    - src/auth/auth-guard.ts
    - src/auth/websocket-auth.ts
    - src/realtime/message-relay-publisher.ts
    - src/realtime/group-relay-publisher.ts
    - src/realtime/trust-change-publisher.ts

key-decisions:
  - "Auth guard accepts access or ID tokens by falling back from one verifier to another, short-circuiting on expiration."
  - "WebSocket connecting in production (STAGE=production) strictly requires headers and no longer falls back to query tokens."
  - "Log redaction hashes sensitive IDs via SHA-256 slice rather than blinding them completely to preserve triage tracking."

patterns-established:
  - "Redacted runtime logs via log-redact utility."
  - "Fail-closed secret store fetching on first access with invocation caching."
  - "Time-insensitive retention tests via vi.useFakeTimers."

requirements-completed:
  - SEC-02

# Metrics
duration: 30min
completed: 2026-04-09
---

# Phase 07 Plan 02 Summary

**Production-safe dual JWT acceptance, fail-closed AWS secrets resolution, and SHA-256 redacted sensitive realtime logging**

## Performance

- **Duration:** 30m
- **Started:** 2026-04-09T03:54:00Z
- **Completed:** 2026-04-09T04:10:00Z
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments
- Implemented full route-aware token acceptance by gracefully falling back from access to ID verifiers in auth guard.
- Hardened WebSocket connect in production environments to strictly require and evaluate `Authorization` headers.
- Built a Secrets Manager backed config resolver that caches on warm lambda runs and fails close.
- Masked real user/device IDs in API Gateway WS logs using deterministic short hashes to leave footprints without PII.
- Fixed hidden brittle test regressions in offline retention policies failing across date thresholds by standardizing fake timers.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make auth verification route-aware and production-safe** - `76d5527` (feat)
2. **Task 2: Add fail-closed secret resolution for runtime config** - `18d631f` (feat)
3. **Task 3: Redact sensitive metadata in realtime warning logs** - `f112fc2` (feat)

## Files Created/Modified
- `src/auth/jwt-verifier.ts` - Setup two verifiers for tokens.
- `src/auth/websocket-auth.ts` - Refined stage evaluation logic to ban proxy token param in prod.
- `src/app/secret-store.ts` - Fetches from Secret Manager.
- `src/realtime/log-redact.ts` - Generates deterministic short hashes.
- `src/realtime/*` - Applied logging utility across relays.

## Decisions Made
- Used SHA-256 slicing to redact identifying metadata to allow log traceability but restrict PII.

## Deviations from Plan

### Auto-fixed Issues

**1. [Test Regression] Retention bounded integration tests failed due to arbitrary start date**
- **Found during:** Task 3 verification step (running entire test suite)
- **Issue:** The queue message expiry policy (7 days) randomly triggered bounds because local computer tests execute more than 7 days ahead from the hardcoded mock records dated at `2026-04-01`.
- **Fix:** Switched affected test runners (`message-replay.test.ts`, `messages-reconnect.test.ts`) to `vi.setSystemTime` so execution operates synchronously relative to fixed seed dates.
- **Files modified:** tests/unit/message-replay.test.ts, tests/integration/messages-reconnect.test.ts
- **Verification:** Unit tests ran correctly passing exact call assertions.
- **Committed in:** `f112fc2` (part of task commit)

---

**Total deviations:** 1 auto-fixed
**Impact on plan:** Improved test suite stability over time bounds. No scope creep.

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
Phase 07 completely fulfilled making the runtime infrastructure robust.
