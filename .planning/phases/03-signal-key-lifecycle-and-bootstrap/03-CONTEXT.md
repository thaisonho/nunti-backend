# Phase 3: Signal Key Lifecycle and Bootstrap - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Clients can publish and retrieve Signal bootstrap key material with safe one-time semantics. This phase covers device key upload, current key-state retrieval, one-time prekey bundle consumption, asynchronous bootstrap metadata, and trust-change signaling. It does not add direct messaging relay or group messaging.

</domain>

<decisions>
## Implementation Decisions

### Key material model
- Store bootstrap key material on the existing device item instead of introducing a separate key table.
- Keep identity key and signed prekey as the current active set only; overwrite the current set on upload rather than preserving version history in this phase.
- Store one-time prekeys as individual records so each prekey can be consumed independently.
- Expose public key material using structured typed fields in JSON rather than raw binary blobs.

### One-time prekey consumption
- Fetching a bootstrap bundle must delete the selected one-time prekey immediately as part of the same atomic operation.
- Each fetch returns exactly one one-time prekey.
- If no one-time prekeys remain, return a 409 conflict to signal that the uploader must replenish the pool.
- Do not add request-id idempotency or reservation-token retry handling in this phase.

### Bootstrap API contract
- Use `PUT /devices/{deviceId}/keys` for key upload and replacement.
- Use `GET /users/{userId}/devices/{deviceId}/bootstrap` for bootstrap retrieval.
- Any trusted device on the account may upload or replace key material for one of the user’s devices.
- Bootstrap responses should include the current key state plus one consumable one-time prekey in the same envelope.

### Trust-change events
- Emit trust-change events for key upload, device revoke, and trust registration changes.
- Deliver those events to the user’s same-account active devices.
- Model the transport as direct WebSocket fanout.
- Keep the event payload minimal: change type, deviceId, and timestamp.

### Claude's Discretion
- Exact field names for key payloads and bootstrap envelopes.
- Exact DynamoDB attribute layout for active key material versus one-time prekey items.
- Exact event routing mechanics and connection lookup details for WebSocket fanout.

</decisions>

<specifics>
## Specific Ideas

- Reuse the existing device management flow as the entry point for key lifecycle state.
- Keep the bootstrap response focused on session initiation rather than broader device profile data.
- Preserve the same-account trust boundary already established in Phase 2.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement authority
- `.planning/ROADMAP.md` - Defines the fixed Phase 3 boundary, goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` - Defines KEYS-01 through KEYS-04 obligations.
- `.planning/PROJECT.md` - Captures the fixed AWS stack, Signal-based E2EE direction, and collaboration constraints.
- `.planning/STATE.md` - Confirms the current milestone and phase focus.

### Prior phase continuity
- `.planning/phases/02-identity-and-device-access/02-CONTEXT.md` - Establishes authenticated device trust boundaries and protected-route conventions that Phase 3 builds on.

### Workflow contracts
- `.github/get-shit-done/workflows/discuss-phase.md` - Defines discuss-phase scope guardrails and output expectations.
- `.github/get-shit-done/templates/context.md` - Defines the required CONTEXT.md structure for downstream agents.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/devices/device-model.ts` - Current device record shape is the natural place to extend with active key-state fields.
- `src/devices/device-repository.ts` - Already uses DynamoDB document client access patterns that can support atomic updates and per-device records.
- `src/devices/device-service.ts` - Centralizes device lifecycle policy and can host key lifecycle orchestration.
- `src/handlers/http/devices-register.ts` - Demonstrates the current authenticated HTTP handler pattern for device-scoped operations.
- `src/auth/auth-guard.ts` - Reusable bearer-token verification for the upload and bootstrap routes.

### Established Patterns
- Device state is modeled as a user-partitioned DynamoDB record with `pk`/`sk` keys and simple status transitions.
- HTTP handlers consistently parse JSON with `zod`, call a service layer, and translate `AppError` instances into stable API errors.
- Authentication is user-centric today; Phase 3 can reuse that pattern for account-owned device key management.

### Integration Points
- New key lifecycle handlers should live under `src/handlers/http/` alongside the existing device endpoints.
- The device repository will need atomic item updates to support one-time prekey deletion and current key-state replacement.
- Trust-change event emission will need to hook into device/key write paths and later integrate with the realtime delivery layer.

</code_context>

<deferred>
## Deferred Ideas

- Preserving historical key versions for audit and debugging.
- Request-id deduplication or reservation-token semantics for bundle fetch retries.
- Returning a richer trust/event payload than the minimal change type, deviceId, and timestamp contract.
- Any external-recipient notification model beyond same-account active devices.

</deferred>

---

*Phase: 03-signal-key-lifecycle-and-bootstrap*
*Context gathered: 2026-03-20*
