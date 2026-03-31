# Phase 3: Signal Key Lifecycle and Bootstrap - Research

**Researched:** 2026-03-20
**Domain:** Signal key lifecycle, DynamoDB atomic state, AWS WebSocket fanout
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Store bootstrap key material on the existing device item instead of introducing a separate key table.
- Keep identity key and signed prekey as the current active set only; overwrite the current set on upload rather than preserving version history in this phase.
- Store one-time prekeys as individual records so each prekey can be consumed independently.
- Expose public key material using structured typed fields in JSON rather than raw binary blobs.
- Fetching a bootstrap bundle must delete the selected one-time prekey immediately as part of the same atomic operation.
- Each fetch returns exactly one one-time prekey.
- If no one-time prekeys remain, return a 409 conflict to signal that the uploader must replenish the pool.
- Do not add request-id idempotency or reservation-token retry handling in this phase.
- Use `PUT /devices/{deviceId}/keys` for key upload and replacement.
- Use `GET /users/{userId}/devices/{deviceId}/bootstrap` for bootstrap retrieval.
- Any trusted device on the account may upload or replace key material for one of the user’s devices.
- Bootstrap responses should include the current key state plus one consumable one-time prekey in the same envelope.
- Emit trust-change events for key upload, device revoke, and trust registration changes.
- Deliver those events to the user’s same-account active devices.
- Model the transport as direct WebSocket fanout.
- Keep the event payload minimal: change type, deviceId, and timestamp.

### Claude's Discretion
- Exact field names for key payloads and bootstrap envelopes.
- Exact DynamoDB attribute layout for active key material versus one-time prekey items.
- Exact event routing mechanics and connection lookup details for WebSocket fanout.

### Deferred Ideas (OUT OF SCOPE)
- Preserving historical key versions for audit and debugging.
- Request-id deduplication or reservation-token semantics for bundle fetch retries.
- Returning a richer trust/event payload than the minimal change type, deviceId, and timestamp contract.
- Any external-recipient notification model beyond same-account active devices.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KEYS-01 | Device can upload identity key and signed prekey for session bootstrap. | Extend the current device record with active key-state fields; reuse the existing authenticated device flow and HTTP handler pattern. |
| KEYS-02 | Backend provides one-time prekey bundles with atomic consume semantics. | Use DynamoDB atomic write/delete semantics on individual prekey records; plan for conditional delete retries and 409 depletion handling. |
| KEYS-03 | Backend exposes session bootstrap metadata APIs for asynchronous initiation. | Shape the bootstrap response as a current-state envelope plus one consumable prekey and keep the contract JSON-structured. |
| KEYS-04 | Backend emits trust-change events when key or device state changes. | Add a dedicated trust-event publisher and WebSocket fanout path for same-account active devices; do not couple this directly to handlers. |
</phase_requirements>

## Summary

Phase 3 should extend the existing user-partitioned device model rather than introducing a new persistence boundary. The current code already uses a DynamoDB document client, a service layer around device state, a stable HTTP response envelope, and a reusable Cognito auth guard. That makes the device service the right orchestration point for key upload, bootstrap retrieval, and trust-change signaling.

The main technical risk is one-time prekey consumption. A naive query-then-delete flow will race under concurrent bootstrap requests, so the plan needs an atomic delete path with conditional failure handling and a clear 409 depletion response when the pool is exhausted. The second risk is realtime delivery: the repository has no WebSocket runtime, no connection registry, and no API Gateway Management API dependency yet, so trust-change emission must be designed as its own delivery abstraction rather than embedded directly in HTTP handlers.

**Primary recommendation:** keep active key material on the device record, store one-time prekeys as sibling items in the same DynamoDB partition, consume them with conditional atomic deletion, and route trust-change events through a separate WebSocket fanout layer backed by a connection registry.

## Standard Stack

Registry snapshot verified on 2026-03-20. Current repo pins slightly older AWS SDK patch releases; the latest registry versions are listed below so planning can assume current package shapes.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @aws-sdk/client-dynamodb | 3.1013.0 (published 2026-03-19T20:28:40.687Z) | Low-level DynamoDB access | AWS SDK v3 is the repo standard and keeps service clients modular. |
| @aws-sdk/lib-dynamodb | 3.1013.0 (published 2026-03-19T20:34:37.275Z) | Document client, Put/Update/Delete/Query/transaction helpers | Already used by the device repository and best fits JSON-shaped key records. |
| @aws-sdk/client-apigatewaymanagementapi | 3.1013.0 (published 2026-03-19T20:26:21.383Z) | WebSocket PostToConnection fanout | Required for direct API Gateway WebSocket delivery; not yet present in package.json. |
| zod | 4.3.6 (published 2026-01-22T19:14:35.382Z) | Request payload validation | Existing handlers already use it for schema validation and error rejection. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| aws-jwt-verify | 5.1.1 (published 2025-10-02T07:17:44.622Z) | Cognito token verification | Reuse the current auth guard for trusted-device authorization on key routes. |
| @middy/core | 7.2.1 (published 2026-03-19T01:10:46.142Z) | Lambda middleware composition | Useful if the phase later wants consistent handler wrappers, but not required for the current HTTP style. |
| vitest | 4.1.0 (published 2026-03-12T14:06:30.610Z) | Unit/integration test runner | Current test harness and the right fit for repository-level and handler-level contract tests. |
| typescript | 5.9.3 (published 2025-09-30T21:19:38.784Z) | Static typing | Existing compiler target for all runtime and test code. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing device-partition model | Separate key table | Adds another consistency boundary and makes bootstrap reads more complex; explicitly out of scope for this phase. |
| Direct WebSocket fanout | SNS, EventBridge, or queued delivery | Better for decoupling later, but it does not match the locked direct fanout decision for Phase 3. |
| Raw binary key payloads | Typed JSON fields | Binary payloads are harder to validate, serialize, and inspect in logs. |

**Installation:**
```bash
npm install @aws-sdk/client-apigatewaymanagementapi
```

**Version verification:**
- The AWS SDK packages currently in package.json are pinned to 3.1012.0, while the latest registry patch is 3.1013.0.
- No current package exists for WebSocket fanout in the repo; `@aws-sdk/client-apigatewaymanagementapi` should be added when planning the realtime path.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── app/                  # shared errors, config, HTTP response helpers
├── auth/                 # bearer-token verification and auth errors
├── devices/              # device record, device service, repository, and key lifecycle orchestration
├── handlers/http/        # upload/bootstrap routes alongside current device endpoints
└── realtime/             # connection registry and WebSocket fanout abstractions for trust events
```

### Pattern 1: Device Record as Current Key State
**What:** Extend the existing device record with the active identity key, signed prekey, and related bootstrap metadata. Overwrite the active set on upload instead of keeping key history in this phase.
**When to use:** When bootstrap reads need the current device state plus a consumable one-time prekey, and the product decision is to avoid a separate key table.
**Example:**
```ts
// Current repo pattern: handler -> auth -> service -> repository
const user = await requireAuth(event.headers.Authorization || event.headers.authorization);
const device = await DeviceService.registerDevice({
  userId: user.sub,
  deviceId: validationResult.data.deviceId,
  deviceLabel: validationResult.data.deviceLabel,
  platform: validationResult.data.platform,
  appVersion: validationResult.data.appVersion
});
```

### Pattern 2: One-Time Prekeys as Sibling Items with Atomic Consume
**What:** Store each one-time prekey as its own DynamoDB item under the same user/device partition. Bootstrap should pick one candidate, attempt a conditional delete, and retry on contention until it either succeeds or exhausts the pool.
**When to use:** When each prekey must be consumed exactly once and concurrent bootstrap requests may race.
**Example:**
```ts
// Planning shape: query a candidate, delete it conditionally, then return the bundle.
// If the conditional delete fails, try the next candidate; if none remain, return 409.
```

### Pattern 3: Trust-Change Publisher with WebSocket Fanout
**What:** Emit trust-change events from the device/key service layer, not from the HTTP handler, and deliver them through a connection-registry-backed WebSocket publisher.
**When to use:** When multiple active devices on the same account need near-real-time visibility into key upload, revoke, or trust-registration changes.
**Example:**
```ts
// Planning shape: write state first, then publish a minimal trust-change event.
await trustChangePublisher.publish({
  changeType: "key-updated",
  deviceId,
  timestamp: now,
});
```

### Anti-Patterns to Avoid
- Query-then-delete without a conditional guard: it will double-consume prekeys under concurrency.
- Storing one-time prekeys in a mutable array on the device item: array updates are harder to reason about and race more easily than per-item deletion.
- Sending trust events as full device snapshots: the locked contract is intentionally minimal.
- Wiring API Gateway management calls directly into HTTP handlers: it couples delivery concerns to request validation and makes retries harder.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic prekey consumption | Custom in-memory locking or ad hoc retries | DynamoDB conditional delete or transactional write semantics | The guarantee must survive Lambda concurrency and retries. |
| Realtime delivery to active devices | A bespoke socket broker | API Gateway WebSocket plus `PostToConnection` | The project already chose managed WebSocket infrastructure. |
| Connection bookkeeping | Hidden state in the handler | A dedicated connection registry/repository | WebSocket connections are ephemeral and need explicit lifecycle tracking. |
| Payload validation | Manual shape checks | zod schemas | Current handlers already standardize on zod and stable error envelopes. |

**Key insight:** Phase 3 is mostly a state-consistency problem, not a cryptography problem. The hard parts are DynamoDB atomicity and keeping realtime fanout isolated from the HTTP request path.

## Common Pitfalls

### Pitfall 1: Racy One-Time Prekey Selection
**What goes wrong:** Two bootstrap requests can select the same candidate if the code reads first and deletes later without a conditional guard.
**Why it happens:** DynamoDB reads are not a lock, and Lambda requests can overlap.
**How to avoid:** Make deletion conditional on item existence, retry on contention, and only return 409 after the pool is actually exhausted.
**Warning signs:** Duplicate bootstrap successes, missing prekeys without corresponding delete errors, or flaky tests under parallel execution.

### Pitfall 2: Missing Realtime Infrastructure
**What goes wrong:** Trust-change emission gets planned as if WebSocket delivery already exists, but the repo has no connection registry, no API Gateway management client, and no connect/disconnect path.
**Why it happens:** Phase 2 stopped at HTTP device access, so no realtime substrate exists yet.
**How to avoid:** Introduce a separate realtime abstraction and plan the connection registry as a first-class component.
**Warning signs:** Handlers that import WebSocket clients directly or a fanout path that cannot remove stale connections.

### Pitfall 3: Overwriting Active Key State Without Clear Semantics
**What goes wrong:** A key upload can silently erase the current active set without a clear trust-change signal or timestamp.
**Why it happens:** The phase decision is to keep only the current active set, so replacement behavior must be explicit.
**How to avoid:** Treat upload as a replacement event, update the device record atomically, and emit a minimal trust-change notification afterward.
**Warning signs:** Bootstrap reads returning partial key state, or client confusion about whether a replacement is current.

### Pitfall 4: Authorization Boundary Drift
**What goes wrong:** A valid user token is treated as enough to manage any device key, even if the caller is not on the same trusted account/device boundary.
**Why it happens:** Phase 3 reuses the Phase 2 auth model but adds a stricter account-owned device trust rule.
**How to avoid:** Keep the same-account trusted-device check in the service layer before allowing upload or replacement.
**Warning signs:** Cross-device key upload attempts that succeed, or trust events emitted for untrusted callers.

## Code Examples

Verified patterns from the current repository:

### Handler Flow
```ts
// Source: current repository pattern in src/handlers/http/devices-register.ts
const user = await requireAuth(event.headers.Authorization || event.headers.authorization);

const validationResult = registerSchema.safeParse(parsedBody);
if (!validationResult.success) {
  return rawErrorResponse(400, 'VALIDATION_ERROR', 'Invalid input parameters');
}

const device = await DeviceService.registerDevice({
  userId: user.sub,
  deviceId: validationResult.data.deviceId,
  deviceLabel: validationResult.data.deviceLabel,
  platform: validationResult.data.platform,
  appVersion: validationResult.data.appVersion
});
```

### Repository Update Flow
```ts
// Source: current repository pattern in src/devices/device-repository.ts
const result = await ddbDocClient.send(new UpdateCommand({
  TableName: getTableName(),
  Key: {
    pk: `USER#${userId}`,
    sk: `DEVICE#${deviceId}`
  },
  UpdateExpression: updateExpr,
  ExpressionAttributeNames: exprNames,
  ExpressionAttributeValues: exprValues,
  ReturnValues: "ALL_NEW"
}));
```

### Bootstrap Consume Shape
```ts
// Planning shape only: keep the atomic delete inside the repository/service boundary.
// The caller should receive exactly one prekey or a 409 when the pool is empty.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate key table for bootstrap state | Device-partitioned current key state plus sibling one-time prekeys | Phase 3 context decision | Fewer joins and a simpler trust boundary, at the cost of no key history in this phase. |
| Read-then-delete bundle consumption | Conditional atomic delete with retry on contention | Needed for safe one-time semantics | Prevents duplicate prekey issuance under concurrent bootstrap requests. |
| Handlers talking directly to realtime delivery | Service-layer event emission with a WebSocket publisher | Needed for Phase 3 trust-change signaling | Keeps request validation, persistence, and delivery concerns separated. |

**Deprecated/outdated:**
- Historical key versioning: deferred by phase decision.
- Reservation tokens for bundle retries: explicitly deferred.
- Rich trust payloads: deferred in favor of the minimal change type, deviceId, and timestamp contract.

## Open Questions

1. **Exact key payload names**
   - What we know: the phase must use structured JSON, not binary blobs.
   - What's unclear: the precise field names for identity key, signed prekey, and one-time prekey envelopes.
   - Recommendation: choose names that map cleanly to the device model and bootstrap response, then keep them stable across upload and retrieval.

2. **Bootstrap envelope shape**
   - What we know: the response must include current key state plus one consumable one-time prekey.
   - What's unclear: whether device trust metadata, registration timestamps, or counts of remaining prekeys should be included.
   - Recommendation: keep the payload minimal unless the plan can justify extra fields for client bootstrap logic.

3. **Connection registry layout**
   - What we know: trust events must fan out to same-account active devices over WebSocket.
   - What's unclear: whether to introduce a separate connection table or reuse the device partition for ephemeral connection IDs.
   - Recommendation: prefer a dedicated connection registry because connection state is transient and not the same as device trust state.

4. **Event delivery failure policy**
   - What we know: direct fanout is the locked transport model.
   - What's unclear: whether a stale connection should be ignored, retried, or trigger a persisted retry path.
   - Recommendation: plan for stale-connection cleanup on `410 Gone` and treat fanout as best-effort per active connection.

5. **Prekey contention behavior**
   - What we know: each fetch must consume exactly one prekey atomically.
   - What's unclear: how aggressively to retry after a conditional delete collision before surfacing depletion.
   - Recommendation: retry over the remaining candidate set in the same request, then return 409 only when no usable prekeys remain.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npm test -- tests/unit/*key*.test.ts tests/integration/*key*.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| KEYS-01 | Upload identity key and signed prekey; later retrieve current device key state | unit + integration | `npm test -- tests/unit/key-service.test.ts tests/integration/keys-upload.test.ts` | ❌ Wave 0 |
| KEYS-02 | One-time prekey bundle is consumed atomically and not re-issued | integration + concurrency-focused unit | `npm test -- tests/integration/keys-bootstrap.test.ts tests/unit/key-repository.test.ts` | ❌ Wave 0 |
| KEYS-03 | Bootstrap metadata API returns the current state envelope | integration | `npm test -- tests/integration/keys-bootstrap.test.ts` | ❌ Wave 0 |
| KEYS-04 | Trust-change events emit on key/device state changes | unit + integration with mocked WebSocket client | `npm test -- tests/unit/trust-event-publisher.test.ts tests/integration/trust-events.test.ts` | ❌ Wave 0 |

### Sampling Rate
- Per task commit: `npm test -- tests/unit/*key*.test.ts tests/integration/*key*.test.ts`
- Per wave merge: `npm test`
- Phase gate: full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- No key-lifecycle unit tests yet.
- No bootstrap or trust-event integration tests yet.
- No WebSocket connection registry or API Gateway management client dependency yet.
- No DynamoDB transaction or conditional-delete tests for one-time prekey consumption yet.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/03-signal-key-lifecycle-and-bootstrap/03-CONTEXT.md` - locked Phase 3 decisions and scope boundary.
- `.planning/ROADMAP.md` - Phase 3 goal, dependency order, and success criteria.
- `.planning/REQUIREMENTS.md` - KEYS-01 through KEYS-04 requirement definitions.
- `.planning/PROJECT.md` - fixed AWS stack direction and realtime/WebSocket intent.
- `src/devices/device-model.ts` - current device record shape.
- `src/devices/device-repository.ts` - existing DynamoDB document client patterns.
- `src/devices/device-service.ts` - current orchestration layer for device state.
- `src/handlers/http/devices-register.ts` - HTTP handler validation/service pattern.
- `src/auth/auth-guard.ts` - reusable bearer-token verification contract.
- `src/app/errors.ts` - stable error taxonomy for 401/403/409/500 handling.
- `package.json` and `npm view` registry snapshot - package versions and missing WebSocket management client.

### Secondary (MEDIUM confidence)
- `npm view` results for AWS SDK, auth, validation, and test packages - current published versions and timestamps.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - repository dependencies and registry versions were verified directly.
- Architecture: MEDIUM - the device model and handler flow are concrete, but the realtime layer is not yet present in code.
- Pitfalls: MEDIUM - based on repository patterns plus established DynamoDB/WebSocket concurrency concerns.

**Research date:** 2026-03-20
**Valid until:** 2026-04-19