---
phase: "04"
plan: "04"
subsystem: "messaging-retention"
tags:
  - retention
  - replay
  - backlog-drain
  - delivery-failure
requires:
  - message-repository
  - message-service
  - message-relay-publisher
provides:
  - retention-aware-replay-path
  - terminal-failed-expired-messages
  - replay-failure-regression-coverage
affects:
  - message-service (replayBacklog retention gate)
  - tests/integration/messages-failure.test.ts
tech_stack:
  added: []
  patterns:
    - "queued-message retention gate in live replay flow"
    - "skip relay for expired backlog entries"
key_files:
  created:
    - .planning/phases/04-reliable-1-1-messaging-core/04-04-PLAN.md
    - .planning/phases/04-reliable-1-1-messaging-core/04-04-SUMMARY.md
  modified:
    - src/messages/message-service.ts
    - tests/integration/messages-failure.test.ts
key_decisions:
  - "Expired queued messages are checked during replayBacklog, not by a separate sweeper, so terminal failure happens on the live user-facing flow."
  - "Expired backlog entries skip relay attempts entirely after the sender receives a failed delivery-status event."
requirements_completed:
  - MSG-02
duration: "6 min"
completed: "2026-04-01"
---

# Phase 04 Plan 04: Retention Wiring Summary

Retention-aware replay now fails stale queued messages through the live backlog drain path and skips any relay attempt for those expired records.

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-01T23:56:00Z
- **Completed:** 2026-04-01T23:58:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wired `checkRetentionPolicy()` into `replayBacklog()` so expired queued messages become terminal failures during the user-facing replay flow.
- Converted the failure regression into a replay-path test that proves expired messages are not relayed, are marked failed, and emit a failed sender status.
- Kept the existing helper edge cases for recent, delivered, and already-failed records.

## Files Created/Modified

- `src/messages/message-service.ts` - Calls the retention helper before replaying each queued record.
- `tests/integration/messages-failure.test.ts` - Covers the wired replay path plus helper edge cases.

## Decisions Made

- Retention stays deterministic and on-path: no sweeper, no repository filtering changes, just a live replay gate.
- The replay loop continues draining after an expired record so one stale message does not block newer backlog entries.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## Next Phase Readiness

Phase 4 is ready to re-verify and then complete once the updated verification report is clean.

---
*Phase: 04-reliable-1-1-messaging-core*
*Completed: 2026-04-01*
