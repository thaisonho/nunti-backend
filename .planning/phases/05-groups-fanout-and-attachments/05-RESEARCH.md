# Phase 5: Groups, Fanout, and Attachments - Research

**Researched:** 2026-04-02
**Domain:** Group messaging on top of existing 1:1 websocket relay and DynamoDB persistence
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Group membership event behavior
- Emit membership events to all current group members after each accepted change, including the actor.
- Membership events in scope: `member-joined`, `member-left`, `member-removed-by-admin`, `member-role-updated`, `group-profile-updated`.
- Use delta payloads (no full member-list snapshot): include `changeType`, `actorUserId`, `targetUserId`, and event timestamp.
- Include both `actorUserId` and `targetUserId` for leave/remove semantics; for self-leave, actor and target are the same.
- Membership events must be replayed in-order on reconnect for devices that missed them while offline.
- Include a stable `eventId` on every membership event for client deduplication.
- Ordering anchor is `serverTimestamp` plus monotonic `eventId`.
- Failures return structured error events with machine-readable `code`, generic `message`, and `requestId`.

### Group message routing contract
- Recipient audience is all current group members except the sender.
- Recipient set is determined by membership snapshot at server accept time (deterministic cutoff).
- Sender receives immediate accepted send-result containing `groupMessageId`.
- Final outcomes are emitted asynchronously as per-recipient-device status events (`delivered`, `accepted-queued`, `failed`) rather than a single global group status.

### Multi-device fanout expectations
- For each recipient user, fan out to all trusted active devices.
- If recipient devices are offline, queue per-device and replay on reconnect.
- Sender multi-device sync is in-scope: also fan out sender-side mirror copy to sender's other trusted devices.
- Overall success is partial-by-design: do not enforce all-or-nothing fanout; report per-device outcomes.

### Attachment envelope behavior
- Required attachment envelope metadata: `attachmentId`, `storagePointer`, `mimeType`, `byteSize`, `contentHash`.
- Optional metadata accepted in this phase: `originalFileName`, `thumbnailPointer`.
- Transport mode is envelope-only (no binary media payload over websocket message transport).
- Invalid/missing attachment metadata is rejected before fanout with structured validation error.
- Attachment envelope travels in normal message ordering path (same ordering contract as message events).

### Claude's Discretion
- Exact websocket `eventType` names for newly introduced group/membership/attachment events while preserving the selected semantics.
- Exact field naming for group and attachment identifiers.
- Exact sender-device mirror event envelope design for sender multi-device sync.
- Exact code-level error taxonomy values as long as machine-readable code + message + requestId contract is preserved.

### Deferred Ideas (OUT OF SCOPE)
- None - discussion stayed within Phase 5 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRP-01 | Backend routes group membership events (join, leave, update) to relevant members. | Membership event contract, storage keys for ordered replay, and fanout publisher strategy in this document. |
| GRP-02 | User can send and receive encrypted group messages. | Group send orchestration pattern built on current `sendMessage` architecture with deterministic membership snapshot and sender `accepted` response. |
| GRP-03 | Backend fans out message delivery across user active devices. | Device-targeted fanout and queue/replay extension using existing connection registry and replay flow. |
| GRP-04 | Backend supports encrypted attachment envelope transport. | Attachment envelope contract, validation rules, and persistence fields integrated into group message path. |
</phase_requirements>

## Summary

Phase 5 should extend the existing 1:1 architecture instead of introducing a new transport path. The strongest fit is: keep websocket route semantics from `src/handlers/ws/messages.ts`, keep idempotent persistence and replay semantics from `src/messages/message-service.ts` + `src/messages/message-repository.ts`, and add group-aware orchestration and contracts as additive modules under `src/messages/` and `src/realtime/`.

DynamoDB should remain single-table-per-domain style already in use: the message table stores canonical group event/message records and per-device inbox projections for replay. This preserves current reconnect behavior from `src/handlers/ws/reconnect.ts` and existing tests (`messages-reconnect`, `messages-dedup`, `messages-failure`) while scaling to multi-recipient fanout and attachment envelopes.

**Primary recommendation:** Implement group delivery as an extension of the current accepted -> delivered/accepted-queued/failed model with per-device projection rows, deterministic membership snapshot at accept time, and strict event ordering by `serverTimestamp + eventId`.

## Existing Architecture Fit

### Reuse directly
- `src/messages/message-service.ts`: Keep sender immediate `accepted`, then async outcome events.
- `src/messages/message-repository.ts`: Keep conditional-write idempotency and inbox replay ordering pattern.
- `src/realtime/connection-registry.ts`: Keep user+device connection lookups and stale cleanup behavior.
- `src/realtime/message-relay-publisher.ts`: Keep API Gateway publish + `GoneException` cleanup pattern.
- `src/handlers/ws/reconnect.ts`: Keep backlog-first replay and terminal `replay-complete` signal behavior.

### Additive modules (recommended)
- `src/messages/group-message-model.ts`: group event/message payload contracts and validators.
- `src/messages/group-message-repository.ts`: group event/message and inbox projection persistence.
- `src/messages/group-message-service.ts`: deterministic membership snapshot, fanout orchestration, idempotent group sends.
- `src/realtime/group-relay-publisher.ts`: publish membership and group-message events to device connections.
- `src/handlers/ws/group-messages.ts`: websocket route handler for group send.
- `src/handlers/ws/group-membership.ts`: websocket route handler for membership changes.

### Existing files likely to change
- `src/app/config.ts`: add optional env names if separate table/index needed for groups.
- `src/handlers/ws/messages.ts`: keep existing path; optionally share validation utilities with new group handlers.
- `src/messages/message-model.ts`: optional shared delivery enum extraction for reuse.

## Standard Stack

### Core
| Library | Version (from repo) | Purpose | Why Standard |
|---------|----------------------|---------|--------------|
| `@aws-sdk/lib-dynamodb` | `^3.1012.0` | Persistence with conditional writes/query | Already used for idempotency and replay in message/device repositories. |
| `@aws-sdk/client-apigatewaymanagementapi` | `^3.1021.0` | WebSocket push to active connections | Already used in publisher modules with cleanup behavior. |
| `zod` | `^4.3.6` | Runtime schema validation for websocket payloads | Best fit for strict attachment envelope and event payload validation. |

### Supporting
| Library | Version (from repo) | Purpose | When to Use |
|---------|----------------------|---------|-------------|
| `vitest` | `^4.1.0` | Unit and integration tests | For all new behavior in service/repository/handler layers. |
| `@types/aws-lambda` | `^8.10.161` | Handler typing | For new websocket route handlers. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-device projection rows in same message table | New dedicated queue table | Simpler group query keys but adds infra/env complexity and replay divergence. |
| Additive group modules | Expand existing direct-message files heavily | Faster short-term but increases regression risk and decreases test isolation. |

## DynamoDB Schema Strategy (Options + Recommendation)

### Option A: Extend existing message table (recommended)
Add new key families in `messagesTableName`:
- Canonical group message: `pk=GMSG#{groupMessageId}`, `sk=GMSG#{groupMessageId}`
- Canonical membership event: `pk=GEVT#{eventId}`, `sk=GEVT#{eventId}`
- Group timeline index row: `pk=GROUP#{groupId}`, `sk={serverTimestamp}#{eventId}`
- Device inbox projection row (replay): `pk=GINBOX#{userId}#{deviceId}`, `sk={serverTimestamp}#{eventId}`

Pros:
- Preserves current replay query shape (`pk` query + oldest-first `sk`).
- Reuses retention and failure transitions.
- Minimal infra changes.

Cons:
- More item type branching in one table.

### Option B: Split group timeline and inbox into separate table
- Keep canonical rows in `messagesTableName`.
- Store `GROUP#` and `GINBOX#` in `groupMessagesTableName`.

Pros:
- Cleaner table concerns.

Cons:
- Additional env/deploy complexity and potential eventual consistency joins.

### Recommendation
Use Option A first. It aligns with existing repository patterns and minimizes Wave 0 infra work while supporting deterministic ordering and reconnect replay.

## WebSocket Event Contract Recommendations

### Event types
Recommended additive event types:
- `group-send-result`
- `group-message`
- `group-delivery-status`
- `group-membership-event`
- `group-replay-complete`
- `error` (unchanged contract)

### Core payload fields
- Membership event: `eventId`, `groupId`, `changeType`, `actorUserId`, `targetUserId`, `serverTimestamp`
- Group message event: `eventId`, `groupMessageId`, `groupId`, `senderUserId`, `senderDeviceId`, `ciphertext`, `attachments?`, `serverTimestamp`
- Delivery status: `groupMessageId`, `targetUserId`, `targetDeviceId`, `status`, `serverTimestamp`
- Error event: keep current `code`, `message`, `requestId?`

### Contract fit files
- Add contracts and validators in `src/messages/group-message-model.ts`.
- Keep shared `WebSocketErrorEvent` shape consistent with `src/messages/message-model.ts`.

## Fanout and Replay Strategy

### Accept-time deterministic cutoff
1. Resolve membership snapshot at send acceptance time.
2. Exclude sender user from recipient set.
3. For each recipient user, resolve trusted active devices.
4. Create per-device projection rows with stable `eventId` and initial delivery state.

### Delivery behavior
- Live connection exists: publish `group-message`, update state `delivered`.
- No live connection: mark `accepted-queued`.
- Retention expired before delivery: mark `failed` and notify sender device.

### Replay behavior
- Reuse reconnect model from `src/messages/message-service.ts` and `src/handlers/ws/reconnect.ts`.
- Query `GINBOX#{userId}#{deviceId}` oldest-first.
- Emit `group-replay-complete` after backlog drain attempt.
- Replay includes membership events and queued group messages in strict order by `serverTimestamp` then `eventId`.

## Idempotency Strategy for Group Sends

### Idempotency key
Use `groupMessageId` as immutable idempotency key, same philosophy as `messageId` in current direct flow.

### Write pattern
- Conditional write for canonical group message: `attribute_not_exists(pk) AND attribute_not_exists(sk)`.
- If duplicate, return stored canonical record and do not republish/reproject.
- For fanout projection rows, use deterministic `eventId` derived from canonical record and target tuple to prevent duplicate rows.

### Suggested implementation points
- `src/messages/group-message-repository.ts`: `createGroupMessage(record)`, `getGroupMessage(id)`, `createFanoutProjection(...)`.
- `src/messages/group-message-service.ts`: duplicate short-circuit before any relay side effects.

## Attachment Envelope Contract and Validation

### Envelope schema
Required fields:
- `attachmentId: string`
- `storagePointer: string`
- `mimeType: string`
- `byteSize: number` (integer, > 0)
- `contentHash: string`

Optional fields:
- `originalFileName?: string`
- `thumbnailPointer?: string`

### Validation rules
- Reject empty strings on required fields.
- Reject oversized attachment count per message (recommend hard cap, e.g. 10) to protect payload size.
- Reject negative/zero `byteSize`.
- Reject unknown top-level envelope keys (strict schema) for deterministic client behavior.
- Enforce envelope-only transport: payload must not include binary media content fields.

### Error contract
Return structured websocket `error` payload with:
- `code`: `VALIDATION_ERROR` (or narrowed subtype)
- `message`: generic, non-sensitive
- `requestId`: include if available from route context

## Common Pitfalls and Failure Modes

### Pitfall 1: Non-deterministic recipient set
- What goes wrong: fanout differs across retries/replays.
- Why: membership queried lazily during async fanout instead of at accept time.
- Avoid: persist membership snapshot (or derived recipient user IDs) on canonical group message record.

### Pitfall 2: Event ordering drift between membership and messages
- What goes wrong: client applies membership change after message that depended on it.
- Why: separate queues without shared ordering anchor.
- Avoid: shared ordering tuple `serverTimestamp + eventId` in projection rows.

### Pitfall 3: Duplicate side effects on retry
- What goes wrong: repeated sends generate duplicate fanout events.
- Why: idempotency checked after projection write/publish.
- Avoid: canonical conditional write first, then projection and publish.

### Pitfall 4: Sender mirror feedback loops
- What goes wrong: sender mirror devices re-emit mirrored event.
- Why: no `originDeviceId` marker.
- Avoid: include origin metadata and client-side no-republish rule.

### Pitfall 5: Attachment metadata abuse
- What goes wrong: oversized JSON payload or malformed pointers.
- Why: weak schema checks.
- Avoid: strict zod schema with explicit size/count constraints.

## Testing Strategy (Mapped to Existing Style)

Current style is vitest with mocked repositories/publishers for unit tests and integration-like service orchestration tests under `tests/integration/`.

### New/updated test files (recommended)
- `tests/unit/group-message-model.test.ts`
- `tests/unit/group-message-repository.test.ts`
- `tests/unit/group-message-service.test.ts`
- `tests/unit/group-relay-publisher.test.ts`
- `tests/integration/groups-membership-events.test.ts`
- `tests/integration/groups-fanout.test.ts`
- `tests/integration/groups-attachments.test.ts`
- `tests/integration/groups-reconnect-replay.test.ts`
- `tests/integration/groups-idempotency.test.ts`

### Existing style alignment
- Mirror structure from `tests/integration/messages-dedup.test.ts` for duplicate send guarantees.
- Mirror `tests/integration/messages-reconnect.test.ts` for replay ordering and terminal replay signal.
- Mirror `tests/integration/messages-failure.test.ts` for retention expiration transitions.
- Reuse trust-event style from `tests/integration/trust-events.test.ts` for fanout publisher assertions.

## Phased Implementation Waves

### Wave 0 - Contracts and schema guardrails
- Add group/attachment models + zod validators.
- Add repository skeleton with key builders and conditional write paths.
- Add failing tests for contract validation and idempotent create behavior.

### Wave 1 - Membership event fanout (GRP-01)
- Implement membership event persistence and relay publisher.
- Add membership websocket handler route.
- Add reconnect replay support for membership events.

### Wave 2 - Group send orchestration + device fanout (GRP-02, GRP-03)
- Implement deterministic membership snapshot send flow.
- Project per-recipient-device rows and live relay.
- Add sender mirror fanout to other trusted sender devices.
- Emit per-device status outcomes.

### Wave 3 - Attachment envelope support (GRP-04)
- Add attachment envelopes to group send payloads.
- Enforce envelope validation and structured rejection.
- Ensure ordering and replay path parity with non-attachment group messages.

### Wave 4 - Reliability hardening
- Retention/failure transition checks for group queued messages.
- Replay completion semantics under mixed membership + message backlog.
- Additional race-condition tests (disconnect mid-fanout, stale connection cleanup).

## Concrete File/Module Change Map

| Area | Likely files |
|------|--------------|
| Group contracts + validation | `src/messages/group-message-model.ts` |
| Group persistence and replay queries | `src/messages/group-message-repository.ts` |
| Group send orchestration | `src/messages/group-message-service.ts` |
| Group websocket relay | `src/realtime/group-relay-publisher.ts` |
| Shared connection targeting | `src/realtime/connection-registry.ts` (reuse; minor helper additions possible) |
| WS route handlers | `src/handlers/ws/group-messages.ts`, `src/handlers/ws/group-membership.ts` |
| Reconnect integration | `src/handlers/ws/reconnect.ts` (invoke group replay in same flow) |
| Config/env additions (if needed) | `src/app/config.ts` |
| Unit tests | `tests/unit/group-*.test.ts` |
| Integration tests | `tests/integration/groups-*.test.ts` |

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Payload validation | Manual if/else checks everywhere | `zod` schemas | Centralized, strict, testable contract enforcement. |
| Retry dedup logic | In-memory dedup cache | DynamoDB conditional writes | Survives process restarts and concurrent Lambdas. |
| Live connection state authority | Custom local map per handler | Existing connection registry table | Already handles stale connection cleanup and cross-instance lookup. |

**Key insight:** The current architecture already solves the hardest distributed systems pieces (idempotency, stale connection cleanup, replay boundaries). Phase 5 should compose those primitives rather than replacing them.

## Open Questions

1. Membership source of truth storage is not present in current code.
   - What we know: Phase 5 requires deterministic recipient snapshot at accept time.
   - What is unclear: Whether membership data already exists outside this repo/runtime.
   - Recommendation: Introduce a minimal group membership repository in Phase 5 Wave 1 if no existing source is available.

2. Request ID propagation in websocket handlers is currently inconsistent.
   - What we know: Context locks require `requestId` in failure contracts.
   - What is unclear: Canonical request ID source for websocket route invocations.
   - Recommendation: Add explicit request ID extraction/generation utility and apply across new handlers.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.1.0` |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/unit/group-message-service.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRP-01 | Membership events fanout + replay ordering | integration | `npm test -- tests/integration/groups-membership-events.test.ts tests/integration/groups-reconnect-replay.test.ts` | ❌ Wave 0 |
| GRP-02 | Encrypted group send/receive flow | integration | `npm test -- tests/integration/groups-fanout.test.ts` | ❌ Wave 0 |
| GRP-03 | Per-user multi-device fanout and per-device statuses | integration + unit | `npm test -- tests/integration/groups-fanout.test.ts tests/unit/group-message-service.test.ts` | ❌ Wave 0 |
| GRP-04 | Attachment envelope validation and transport | unit + integration | `npm test -- tests/unit/group-message-model.test.ts tests/integration/groups-attachments.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- tests/unit/group-message-model.test.ts tests/unit/group-message-service.test.ts`
- **Per wave merge:** `npm test -- tests/integration/groups-*.test.ts`
- **Phase gate:** `npm test`

### Wave 0 Gaps
- [ ] `tests/unit/group-message-model.test.ts` - contract and envelope validation for GRP-04
- [ ] `tests/unit/group-message-repository.test.ts` - conditional writes and replay query shaping
- [ ] `tests/unit/group-message-service.test.ts` - idempotency and deterministic recipient snapshot behavior
- [ ] `tests/integration/groups-membership-events.test.ts` - GRP-01 fanout contract
- [ ] `tests/integration/groups-fanout.test.ts` - GRP-02/03 orchestration
- [ ] `tests/integration/groups-attachments.test.ts` - GRP-04 envelope transport/validation
- [ ] `tests/integration/groups-reconnect-replay.test.ts` - membership + message replay ordering
- [ ] `tests/integration/groups-idempotency.test.ts` - duplicate group send side-effect prevention

## Sources

### Primary (HIGH confidence)
- Internal phase context: `.planning/phases/05-groups-fanout-and-attachments/05-CONTEXT.md`
- Requirements and phase boundaries: `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
- Existing runtime contracts and architecture:
  - `src/messages/message-model.ts`
  - `src/messages/message-repository.ts`
  - `src/messages/message-service.ts`
  - `src/realtime/connection-registry.ts`
  - `src/realtime/message-relay-publisher.ts`
  - `src/handlers/ws/messages.ts`
  - `src/handlers/ws/reconnect.ts`
  - `src/devices/device-repository.ts`
- Existing test style references:
  - `tests/integration/messages-reconnect.test.ts`
  - `tests/integration/messages-dedup.test.ts`
  - `tests/integration/messages-failure.test.ts`
  - `tests/integration/trust-events.test.ts`

### Secondary (MEDIUM confidence)
- Dependency baseline from `package.json` and `vitest.config.ts`.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - uses currently installed project dependencies.
- Architecture: MEDIUM - strong fit to current code, but membership source-of-truth module is not yet present.
- Pitfalls: MEDIUM - based on current implementation patterns and known distributed messaging risks.

**Research date:** 2026-04-02
**Valid until:** 2026-05-02
