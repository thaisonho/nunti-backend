# Phase 5: Groups, Fanout, and Attachments - Context

**Gathered:** 2026-04-02  
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable encrypted messaging to scale from 1:1 into group delivery and trusted multi-device fanout, including encrypted attachment envelope transport. This phase includes membership event fanout and replay, deterministic group send orchestration, per-device outcomes, and strict attachment envelope validation/relay. It excludes plaintext media handling and non-messaging product additions.

</domain>

<decisions>
## Implementation Decisions

### Group membership permissions and behavior
- Emit membership events to all current group members after each accepted change, including the actor.
- Membership events in scope: `member-joined`, `member-left`, `member-removed-by-admin`, `member-role-updated`, `group-profile-updated`.
- Use delta payloads (no full member-list snapshot): include `changeType`, `actorUserId`, `targetUserId`, `serverTimestamp`, and stable `eventId`.
- `member-left` is self-only (`actorUserId === targetUserId`).
- Manage-others policy: owner + admins can manage others; regular members can only self-leave.
- `group-profile-updated`: owner + admins only.
- `member-role-updated`: owner-only can promote/demote admin; ownership transfer is out of scope for this phase.
- Unauthorized membership/profile actions return structured websocket error event with `code: FORBIDDEN`, generic message, and `requestId`.
- Membership events replay in-order on reconnect for missed devices, anchored by `serverTimestamp` + monotonic `eventId`.

### Group message routing and sender-visible outcomes
- Recipient audience is all current group members except sender, based on membership snapshot at accept time.
- Sender receives immediate accepted send-result with deterministic snapshot metadata: `groupMessageId`, `recipientUserCount`, `targetDeviceCount`.
- Final outcomes are async per-recipient-device status events (`delivered`, `accepted-queued`, `failed`), not a single global group status.
- Sender mirror fanout is in scope for sender's other trusted devices.
- Sender also receives sender-mirror per-device statuses, marked with `audience = sender-sync`.
- Terminal failure is per-device only (retention expiry); no global message failure aggregate in this phase.

### Multi-device fanout expectations
- Fan out to all trusted active devices for each recipient user.
- If target device is offline, persist as queued and replay on reconnect.
- Partial success is expected and valid; evaluate and report delivery per target device.

### Attachment envelope validation and transport
- Required fields: `attachmentId`, `storagePointer`, `mimeType`, `byteSize`, `contentHash`.
- Optional fields: `originalFileName`, `thumbnailPointer`.
- Envelope-only transport: no binary media payload over websocket.
- Enforce strict validation before fanout:
  - Required fields present and well-formed
  - MIME type allowlist
  - `byteSize` max `25 MiB`
  - `contentHash` format must be SHA-256
  - Max 10 attachment envelopes per message
- If any attachment envelope is invalid, reject entire send pre-fanout with structured validation error.
- Attachment envelopes follow normal message ordering semantics.

### Replay boundaries and drain behavior
- Reconnect drain order: direct-message backlog first, then group backlog (membership/group), then replay boundaries.
- Always emit both replay boundary events even when empty (`eventsReplayed = 0` / equivalent).
- Ordering remains per-stream, oldest-first within each stream; no global cross-stream merge requirement.
- While replay drain is active, live events are buffered behind replay and released after replay-complete boundaries.

### Claude's Discretion
- Exact websocket `eventType` names while preserving semantics above.
- Exact payload field names for group and attachment IDs.
- Exact enum/code taxonomy values beyond required contract guarantees (`FORBIDDEN`, validation/internal families).
- Exact replay boundary payload field naming for direct vs group streams.

</decisions>

<specifics>
## Specific Ideas

- Keep contracts deterministic and machine-consumable for stable client state machines.
- Preserve reconnect continuity as first-class behavior across direct and group streams.
- Keep backend strictly on encrypted envelope transport boundaries.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement authority
- `.planning/ROADMAP.md` - Fixed Phase 5 boundary, dependencies, success criteria.
- `.planning/REQUIREMENTS.md` - GRP-01 through GRP-04 obligations.
- `.planning/PROJECT.md` - AWS/Signal E2EE direction and constraints.
- `.planning/STATE.md` - Current milestone/phase progression.

### Prior phase continuity
- `.planning/phases/03-signal-key-lifecycle-and-bootstrap/03-CONTEXT.md` - Trust-change event style baseline.
- `.planning/phases/04-reliable-1-1-messaging-core/04-CONTEXT.md` - Delivery states, replay semantics, WS error contract.

### Existing runtime contracts and integration points
- `src/messages/message-model.ts`
- `src/messages/message-service.ts`
- `src/messages/message-repository.ts`
- `src/messages/group-message-model.ts`
- `src/messages/group-message-service.ts`
- `src/messages/group-message-repository.ts`
- `src/realtime/connection-registry.ts`
- `src/realtime/message-relay-publisher.ts`
- `src/realtime/group-relay-publisher.ts`
- `src/handlers/ws/messages.ts`
- `src/handlers/ws/group-membership.ts`
- `src/handlers/ws/reconnect.ts`

### Test behavior references
- `tests/integration/messages-reconnect.test.ts`
- `tests/integration/groups-reconnect-replay.test.ts`
- `tests/integration/groups-membership-events.test.ts`

### External specs
- No external ADR/spec documents were referenced in this discussion; decisions here are canonical for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/messages/message-service.ts`: existing idempotent send + queued replay pattern for per-device fanout.
- `src/messages/group-message-service.ts`: existing membership mutation + projection publish path to extend with permission checks.
- `src/messages/group-message-repository.ts`: existing membership event sequencing/projection model for replay continuity.
- `src/realtime/connection-registry.ts`: user/device-targeted connection lookup + stale cleanup.
- `src/realtime/group-relay-publisher.ts` and `src/realtime/message-relay-publisher.ts`: reusable websocket publish + delivery outcome handling.

### Established Patterns
- Flat top-level websocket `eventType` payloads.
- Structured machine-readable errors with `code`, generic `message`, `requestId`.
- Replay drains oldest-first and emits explicit replay-complete boundaries.

### Integration Points
- Add/extend group send + attachment contracts in `src/messages/`.
- Enforce permission and validation rules in WS handlers/services under `src/handlers/ws/` + `src/messages/`.
- Extend persistence/query paths for group-recipient and sender-sync per-device outcomes.

</code_context>

<deferred>
## Deferred Ideas

- Ownership transfer flows and richer role hierarchy beyond owner/admin/member.
- Global merged ordering across direct and group streams.

</deferred>

---

*Phase: 05-groups-fanout-and-attachments*  
*Context updated: 2026-04-02*
