---
phase: 05-groups-fanout-and-attachments
plan: 01
subsystem: messaging
tags:
  - groups
  - membership-events
  - websocket
  - replay
requires:
  - phase: 04-reliable-1-1-messaging-core
    provides: reconnect replay and relay publisher patterns
provides:
  - typed membership event contracts with strict validation
  - deterministic membership event persistence and per-device projections
  - membership fanout publisher and websocket route with structured errors
  - reconnect membership replay with replay-complete boundary
affects:
  - phase-05-wave-2-group-send
  - src/handlers/ws/reconnect.ts
tech-stack:
  added: []
  patterns:
    - deterministic ordering key serverTimestamp plus eventId
    - delta-only membership event payloads with actor and target
key-files:
  created:
    - src/messages/group-message-model.ts
    - src/messages/group-message-repository.ts
    - src/messages/group-message-service.ts
    - src/realtime/group-relay-publisher.ts
    - src/handlers/ws/group-membership.ts
    - tests/unit/group-message-model.test.ts
    - tests/unit/group-message-repository.test.ts
    - tests/unit/group-message-service.test.ts
    - tests/unit/group-relay-publisher.test.ts
    - tests/integration/groups-membership-events.test.ts
    - tests/integration/groups-reconnect-replay.test.ts
  modified:
    - src/handlers/ws/reconnect.ts
key-decisions:
  - "Membership fanout targets all current members plus actor, then filters to trusted devices."
  - "Membership replay uses undelivered per-device projection rows and emits group-replay-complete."
  - "Membership command failures return structured websocket error events including requestId when provided."
patterns-established:
  - "Group membership events use canonical rows + timeline + per-device inbox projections."
  - "Reconnect drains direct-message backlog first, then membership backlog."
requirements-completed:
  - GRP-01
duration: "N/A (terminal execution blocked)"
completed: "2026-04-02"
---

# Phase 5 Plan 01: Membership Event Substrate Summary

Deterministic group membership events now have strict contracts, ordered persistence, live fanout, and reconnect replay continuity with request-correlated error payloads.

## Performance

- **Duration:** N/A (could not measure via workflow CLI)
- **Started:** 2026-04-02T00:00:00Z
- **Completed:** 2026-04-02T00:00:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Implemented strict group membership contracts and validators with locked change types and deterministic projection sort keys.
- Added repository primitives for stable eventId allocation, canonical/timeline writes, and undelivered per-device replay projections.
- Implemented membership service orchestration, stale-safe relay publishing, websocket route handling, and reconnect membership replay boundary signaling.
- Added unit and integration tests covering schema validation, projection ordering, fanout behavior, error contracts, and reconnect replay wiring.

## Task Commits

Each task should be committed atomically by workflow policy. Commits were not created because terminal execution was blocked by workspace provider errors (`ENOPRO: No file system provider found for resource 'file:///workspaces/nunti-backend'`).

1. **Task 1: Define membership contracts and ordered persistence projections** - not committed (blocked)
2. **Task 2: Implement membership fanout route and reconnect replay** - not committed (blocked)

## Files Created/Modified

- `src/messages/group-message-model.ts` - Membership command/event contracts and strict zod validation.
- `src/messages/group-message-repository.ts` - Event allocation, canonical persistence, projection writes, and replay queries.
- `src/messages/group-message-service.ts` - Membership mutation orchestration, fanout, and replay draining.
- `src/realtime/group-relay-publisher.ts` - WebSocket fanout publisher with stale-connection cleanup parity.
- `src/handlers/ws/group-membership.ts` - Membership websocket route with structured error payloads.
- `src/handlers/ws/reconnect.ts` - Reconnect path extended to replay membership backlog after direct messages.
- `tests/unit/group-message-model.test.ts` - Contract and validation tests.
- `tests/unit/group-message-repository.test.ts` - Ordering/eventId/projection repository tests.
- `tests/unit/group-message-service.test.ts` - Fanout and replay orchestration tests.
- `tests/unit/group-relay-publisher.test.ts` - Relay and replay-complete publisher tests.
- `tests/integration/groups-membership-events.test.ts` - Route and structured error behavior tests.
- `tests/integration/groups-reconnect-replay.test.ts` - Reconnect flow integration coverage for membership replay.

## Decisions Made

- Membership projection keys use `serverTimestamp#eventId` to preserve strict replay order.
- Replay includes only undelivered membership projections and emits explicit `group-replay-complete`.
- Structured error payloads in membership route are generic but machine-readable and request-correlated.

## Deviations from Plan

### Auto-fixed Issues

None.

### Execution Blockers

**1. [Rule 3 - Blocking] Terminal/provider execution unavailable for commands**
- **Found during:** Verification and commit steps
- **Issue:** All terminal/task invocations fail with ENOPRO workspace provider errors.
- **Impact:** Could not run plan verification commands, full test suite, or git commits/state CLI updates.
- **Workaround:** Completed implementation and static diagnostics with editor error checks.

---

**Total deviations:** 1 blocking issue (environment/tooling)
**Impact on plan:** Code implementation completed; command-driven verification/commit workflow not executable in current environment.

## Issues Encountered

- Terminal execution unavailable (`run_in_terminal` and `create_and_run_task` both fail with ENOPRO), preventing command-based tests and commit/state automation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Membership substrate is implemented and type-checked in editor diagnostics.
- Before starting 05-02, run the planned test commands and create atomic task commits once terminal provider access is restored.

## Self-Check: FAILED

- Required files created: PASSED
- Required implementation files modified: PASSED
- Task commits recorded: FAILED (terminal blocked)
- Plan verification commands executed: FAILED (terminal blocked)
