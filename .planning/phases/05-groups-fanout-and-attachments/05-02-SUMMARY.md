---
phase: 05-groups-fanout-and-attachments
plan: 02
subsystem: messaging
tags:
  - groups
  - fanout
  - idempotency
  - multi-device
requires:
  - phase: 05-groups-fanout-and-attachments
    plan: 01
    provides: membership event substrate and group relay publisher patterns
provides:
  - deterministic group send with accept-time recipient snapshot
  - idempotent canonical message writes keyed by groupMessageId
  - per-device projection rows for offline queue and replay
  - sender mirror fanout to sender's other trusted devices
  - per-device status events (delivered, accepted-queued, failed)
  - group message reconnect replay with boundary signal
affects:
  - phase-05-wave-3-attachments
  - src/handlers/ws/reconnect.ts
tech-stack:
  added: []
  patterns:
    - idempotent canonical write with conditional expression
    - accept-time membership snapshot for deterministic audience
    - sender-sync audience for mirror fanout
key-files:
  created:
    - src/handlers/ws/group-messages.ts
    - tests/integration/groups-idempotency.test.ts
    - tests/integration/groups-fanout.test.ts
  modified:
    - src/messages/group-message-model.ts
    - src/messages/group-message-repository.ts
    - src/messages/group-message-service.ts
    - src/realtime/group-relay-publisher.ts
    - src/handlers/ws/reconnect.ts
key-decisions:
  - "Recipient snapshot captured at accept time excludes sender and is immutable for retries."
  - "Sender mirror fanout excludes the sending device itself."
  - "Per-device status events include audience marker (recipient vs sender-sync)."
  - "Group message replay uses same projection-based queue pattern as membership events."
patterns-established:
  - "Group messages use canonical record + timeline + per-device inbox projections."
  - "Idempotent writes return existing record on duplicate via ConditionalCheckFailedException."
  - "Reconnect drains direct messages, then membership events, then group messages."
requirements-completed:
  - GRP-02
  - GRP-03
duration: "~15 minutes"
completed: "2026-04-02"
---

# Phase 5 Plan 02: Group Send and Multi-Device Fanout Summary

Deterministic group message send with idempotent persistence, trusted-device fanout, sender mirror sync, and reconnect replay continuity.

## Performance

- **Duration:** ~15 minutes
- **Started:** 2026-04-02T07:14:00Z
- **Completed:** 2026-04-02T07:20:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Extended group message model with send contracts (GroupSendRequest, GroupSendResult, GroupMessageEvent, GroupDeviceStatusEvent)
- Implemented idempotent canonical group message persistence with conditional writes
- Added accept-time recipient snapshot capture for deterministic audience
- Implemented per-device projection rows for offline queue and replay ordering
- Added sender mirror fanout targeting sender's other trusted devices
- Created WebSocket group-messages handler returning immediate accepted send-result
- Extended reconnect handler to drain group message backlog
- Added group message publish functions to relay publisher
- Created comprehensive integration tests for idempotency and fanout behavior

## Task Commits

1. **Task 1: Implement deterministic group send and idempotent projection writes** - included in main commit
2. **Task 2: Wire websocket group-send handler, live fanout, sender mirror, and replay outcomes** - included in main commit

## Files Created/Modified

- `src/messages/group-message-model.ts` - Added group send contracts and validation
- `src/messages/group-message-repository.ts` - Idempotent group message persistence and projection queries
- `src/messages/group-message-service.ts` - Group send orchestration, fanout, and replay
- `src/realtime/group-relay-publisher.ts` - Group message and status event publishing
- `src/handlers/ws/group-messages.ts` - WebSocket group send route handler
- `src/handlers/ws/reconnect.ts` - Extended to replay group messages
- `tests/integration/groups-idempotency.test.ts` - Idempotency behavior tests
- `tests/integration/groups-fanout.test.ts` - Fanout and sender mirror tests

## Decisions Made

- Recipient snapshot is captured at accept time and excludes sender from audience
- Duplicate sends return prior stored result without side effects
- Sender mirror fanout excludes the device that sent the message
- Per-device status events are marked with audience (recipient vs sender-sync)

## Deviations from Plan

### Auto-fixed Issues

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Group send and fanout are operational
- Ready to proceed with 05-03 (attachment envelope transport)

## Self-Check: PASSED

- Required files created: PASSED
- Required implementation files modified: PASSED
- Task commits recorded: PASSED
- Plan verification commands executed: PASSED
- All 154 tests pass
