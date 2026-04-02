---
phase: 05-groups-fanout-and-attachments
plan: 03
subsystem: messaging
tags:
  - groups
  - attachments
  - validation
  - e2ee
requires:
  - phase: 05-groups-fanout-and-attachments
    plan: 02
    provides: group send orchestration and fanout patterns
provides:
  - strict attachment envelope schema with required/optional fields
  - MIME type allowlist, byte size limit, SHA-256 hash validation
  - pre-fanout validation rejection with requestId correlation
  - attachment metadata transport through existing group fanout/replay
affects:
  - future media upload/download phases
tech-stack:
  added: []
  patterns:
    - envelope-only attachment transport (no binary payload)
    - validation-before-persistence rejection
    - requestId error correlation
key-files:
  created:
    - tests/integration/groups-attachments.test.ts
  modified:
    - src/messages/group-message-model.ts
    - src/messages/group-message-repository.ts
    - src/messages/group-message-service.ts
    - src/handlers/ws/group-messages.ts
    - tests/unit/group-message-model.test.ts
key-decisions:
  - "Attachment validation happens before canonical write - invalid envelopes never reach persistence."
  - "RequestId (groupMessageId) included in error responses for client correlation."
  - "Attachments field is omitted from records/events when no attachments present."
  - "Same ordering and replay path used for attachment-bearing messages."
patterns-established:
  - "Strict zod schema with MIME allowlist, byte limit, and hash format validation."
  - "Optional fields (originalFileName, thumbnailPointer) allowed but not required."
  - "Max 10 attachments per message enforced at schema level."
requirements-completed:
  - GRP-04
duration: "~10 minutes"
completed: "2026-04-02"
---

# Phase 5 Plan 03: Attachment Envelope Transport Summary

Strict attachment envelope validation and metadata-only transport through existing group messaging infrastructure.

## Performance

- **Duration:** ~10 minutes
- **Started:** 2026-04-02T07:20:00Z
- **Completed:** 2026-04-02T07:24:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added AttachmentEnvelope schema with required fields (attachmentId, storagePointer, mimeType, byteSize, contentHash)
- Added optional fields support (originalFileName, thumbnailPointer)
- Implemented MIME type allowlist with 12 supported types
- Enforced byteSize max 25 MiB and positive integer constraint
- Enforced SHA-256 contentHash format (64 hex characters)
- Enforced max 10 attachments per message limit
- Added requestId to validation error responses for client correlation
- Integrated attachment metadata into canonical records and projections
- Extended fanout and replay to include attachment metadata in events
- Created comprehensive validation and transport tests

## Task Commits

1. **Task 1: Add strict attachment-envelope schema and rejection behavior** - included in main commit
2. **Task 2: Transport validated attachment envelopes through fanout and replay** - included in main commit

## Files Created/Modified

- `src/messages/group-message-model.ts` - AttachmentEnvelope schema, constants, and validation
- `src/messages/group-message-repository.ts` - Attachment metadata persistence in records
- `src/messages/group-message-service.ts` - Attachment inclusion in fanout and replay events
- `src/handlers/ws/group-messages.ts` - RequestId extraction and error correlation
- `tests/unit/group-message-model.test.ts` - Attachment validation unit tests
- `tests/integration/groups-attachments.test.ts` - Full attachment transport integration tests

## Decisions Made

- Invalid attachment envelopes are rejected before any persistence or fanout
- RequestId is extracted from groupMessageId for error correlation
- Attachments field is omitted (not null/empty array) when no attachments
- Per-device status behavior unchanged for attachment-bearing messages

## Deviations from Plan

### Auto-fixed Issues

None.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 complete: membership events, group send/fanout, and attachment transport implemented
- All 4 GRP requirements (GRP-01 through GRP-04) addressed
- Ready for phase verification or milestone completion

## Self-Check: PASSED

- Required files created: PASSED
- Required implementation files modified: PASSED
- Task commits recorded: PASSED
- Plan verification commands executed: PASSED
- All 180 tests pass
