# Phase 4: Reliable 1:1 Messaging Core - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can exchange encrypted direct messages in real time with durable retry-safe delivery behavior. This phase covers 1:1 WebSocket relay, sender-facing delivery state transitions, idempotent retry outcomes, and reconnect replay of missed encrypted messages. It does not add groups, multi-device fanout expansion rules beyond 1:1 core behavior, or attachment workflows.

</domain>

<decisions>
## Implementation Decisions

### Delivery confirmation semantics
- Initial send acknowledgement should be `accepted` (server accepted relay request), not immediate `delivered`.
- Delivered state is achieved when at least one active recipient device successfully receives relay push.
- If recipient is offline at send time, backend should emit an accepted-queued outcome immediately.
- If queued delivery cannot complete within retention policy, backend should emit a terminal delivery-failed event tied to `messageId`.

### Reconnect replay behavior
- Replay queued messages in strict oldest-first order by server enqueue time.
- Reconnect guarantee is all retained unacknowledged queued messages (not a recent subset only).
- Backend emits an explicit replay-complete event when backlog catch-up is done.
- During reconnect catch-up, backend should drain replay backlog first, then switch to live traffic.

### WebSocket event contract shape
- Standardize a flat top-level `eventType` payload style consistent with existing realtime event shape.
- Mandatory identifiers for message-related events: `messageId`, `senderUserId`, `senderDeviceId`, `recipientUserId`, `serverTimestamp`.
- Sender state transitions should be separate status events (accepted, delivered, failed) rather than a single mutable snapshot-only event.
- Send/protocol validation failures should use structured error events with machine-readable `code`, plus `message` and `requestId`.

### Execution workflow preference
- When implementation begins, execution should start on a separate feature branch (not directly on integration branches).

### Claude's Discretion
- Exact naming of event types and status-code enums, while preserving the chosen semantics.
- Exact replay-complete payload fields.
- Exact queue retention duration and policy constants.
- Exact wire field naming for sender/recipient identity keys in events.

</decisions>

<specifics>
## Specific Ideas

- Preserve existing generic security posture: machine-readable codes for clients, avoid leaking sensitive internals in human-facing messages.
- Keep phase behavior deterministic for reconnect and retries so client state machines remain simple.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement authority
- `.planning/ROADMAP.md` - Defines fixed Phase 4 boundary, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` - Defines MSG-01 through MSG-03 obligations.
- `.planning/PROJECT.md` - Defines AWS stack and Signal-based E2EE backend direction.
- `.planning/STATE.md` - Current milestone and phase progression context.

### Prior phase continuity
- `.planning/phases/02-identity-and-device-access/02-CONTEXT.md` - Protected-route auth and generic error handling preferences.
- `.planning/phases/03-signal-key-lifecycle-and-bootstrap/03-CONTEXT.md` - Existing trust-change realtime style and device trust boundary continuity.

### Existing runtime contracts and patterns
- `src/realtime/trust-change-publisher.ts` - Current realtime `eventType` envelope and connection fanout behavior.
- `src/realtime/connection-registry.ts` - Existing active-connection lookup/removal pattern for realtime delivery paths.
- `src/app/http-response.ts` - Standardized response envelope and requestId pattern to mirror in structured WS error events.
- `src/app/errors.ts` - Machine-readable app error code taxonomy for error contract continuity.

### External specs
- No external ADR/spec documents were referenced in this discussion; decisions above are the canonical source for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/realtime/connection-registry.ts`: Existing active connection listing and stale-connection cleanup primitives.
- `src/realtime/trust-change-publisher.ts`: Existing WebSocket management API publish flow and `GoneException` cleanup behavior.
- `src/auth/auth-guard.ts`: Existing authenticated user extraction pattern for protected transport operations.
- `src/app/http-response.ts` and `src/app/errors.ts`: Established machine-readable error contract pattern with request correlation identifiers.

### Established Patterns
- API responses and errors emphasize stable machine-readable codes with generic outward messages.
- Realtime fanout currently uses flat `eventType` payloads and per-connection best-effort publish with stale connection pruning.
- Device trust model and same-account boundaries were established in earlier phases and should remain consistent.

### Integration Points
- New 1:1 messaging relay handlers/services should integrate alongside existing realtime modules under `src/realtime/` and API handlers under `src/handlers/http/` (or equivalent websocket handler surfaces).
- Delivery status and replay events should reuse connection registry semantics for active connection targeting and cleanup.
- Retry/idempotency decisions must map to persistence and message state orchestration that can later extend into phase 5 fanout.

</code_context>

<deferred>
## Deferred Ideas

- Group delivery semantics and multi-device fanout beyond the Phase 4 1:1 core (Phase 5).
- Attachment envelope transport (Phase 5).

</deferred>

---

*Phase: 04-reliable-1-1-messaging-core*
*Context gathered: 2026-04-01*
