---
phase: 03-signal-key-lifecycle-and-bootstrap
plan: 01
type: execute
wave: 1
depends_on:
  - "02-02"
files_modified:
  - src/devices/device-model.ts
  - src/devices/device-repository.ts
  - src/devices/device-service.ts
  - src/handlers/http/devices-register.ts
  - src/handlers/http/devices-keys.ts
  - src/handlers/http/devices-bootstrap.ts
  - src/handlers/http/devices-revoke.ts
  - src/realtime/connection-registry.ts
  - src/realtime/trust-change-publisher.ts
  - package.json
  - package-lock.json
  - tests/unit/device-key-service.test.ts
  - tests/unit/key-bundle-repository.test.ts
  - tests/unit/trust-change-publisher.test.ts
  - tests/integration/keys-upload.test.ts
  - tests/integration/keys-bootstrap.test.ts
  - tests/integration/trust-events.test.ts
autonomous: true
requirements:
  - KEYS-01
  - KEYS-02
  - KEYS-03
  - KEYS-04
must_haves:
  truths:
    - "A trusted same-account device can upload or replace the current identity key and signed prekey for another device."
    - "A bootstrap request returns the current device key state plus exactly one one-time prekey."
    - "A one-time prekey is consumed atomically and is never re-issued after a successful bootstrap fetch."
    - "Key upload, device revoke, and trust registration changes emit minimal trust-change events to same-account active devices."
  artifacts:
    - path: src/devices/device-model.ts
      provides: "Current active key-state fields on the existing device item"
    - path: src/devices/device-repository.ts
      provides: "Atomic device-key updates and one-time prekey delete/consume persistence"
    - path: src/handlers/http/devices-keys.ts
      provides: "PUT /devices/{deviceId}/keys upload and replacement handler"
    - path: src/handlers/http/devices-bootstrap.ts
      provides: "GET /users/{userId}/devices/{deviceId}/bootstrap handler"
    - path: src/realtime/trust-change-publisher.ts
      provides: "Minimal trust-event emission and fanout orchestration"
    - path: tests/integration/keys-bootstrap.test.ts
      provides: "Bootstrap envelope and atomic consume coverage"
  key_links:
    - from: src/handlers/http/devices-keys.ts
      to: src/devices/device-service.ts
      via: "validated key upload request"
      pattern: "register|upload.*key"
    - from: src/devices/device-service.ts
      to: src/devices/device-repository.ts
      via: "atomic current-state update and one-time prekey deletion"
      pattern: "UpdateCommand|DeleteCommand|TransactWriteCommand"
    - from: src/devices/device-service.ts
      to: src/realtime/trust-change-publisher.ts
      via: "post-write trust-change emission"
      pattern: "publishTrustChange|emitTrustChange"
---

<objective>
Clients can publish and retrieve Signal bootstrap key material with safe one-time semantics.

Purpose: Phase 3 unlocks async session setup without introducing a new persistence boundary or widening the trust model beyond the already validated same-account device rules.
Output: Device key upload/replacement flow, atomic one-time prekey bootstrap flow, and minimal trust-change fanout plumbing.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
@.github/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-signal-key-lifecycle-and-bootstrap/03-CONTEXT.md
@.planning/phases/03-signal-key-lifecycle-and-bootstrap/03-RESEARCH.md

<interfaces>
Key repository and auth contracts already present in the codebase:

From src/devices/device-model.ts
```typescript
export enum DeviceStatus {
  TRUSTED = 'trusted',
  REVOKED = 'revoked',
}

export interface DeviceRecord {
  userId: string;
  deviceId: string;
  status: DeviceStatus;
  registeredAt: string;
  lastSeenAt: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
  revokedAt?: string;
}
```

From src/devices/device-repository.ts
```typescript
export async function upsertDevice(params: UpsertParams): Promise<DeviceRecord>;
export async function getDevice(userId: string, deviceId: string): Promise<DeviceRecord | null>;
export async function listDevicesByUser(userId: string): Promise<DeviceRecord[]>;
export async function updateDeviceStatus(userId: string, deviceId: string, status: DeviceStatus): Promise<DeviceRecord>;
```

From src/devices/device-service.ts
```typescript
export interface RegisterDevicePayload {
  userId: string;
  deviceId: string;
  deviceLabel?: string;
  platform?: string;
  appVersion?: string;
}

export async function registerDevice(payload: RegisterDevicePayload): Promise<DeviceRecord>;
export async function listDevices(userId: string): Promise<DeviceRecord[]>;
export async function revokeDevice(userId: string, deviceId: string): Promise<DeviceRecord>;
```

From src/auth/auth-guard.ts
```typescript
export interface AuthenticatedUser {
  sub: string;
  email?: string;
  username?: string;
  tokenUse: string;
  [key: string]: unknown;
}

export async function requireAuth(authorizationHeader?: string | null): Promise<AuthenticatedUser>;
```

From src/app/errors.ts
```typescript
export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
}
```

Current device handlers already follow the same pattern: parse body with zod, call the service layer, and map AppError instances to stable HTTP responses.
</interfaces>
</context>

<strategy>
Use one implementation wave with a strict build order inside each task: define the JSON contracts and current-state fields first, then implement atomic prekey consumption, then wire trust-event fanout. Keep the HTTP handlers thin and route all state changes through the device service so trust emission is centralized.

Do not add messaging relay, group delivery, reservation tokens, or historical key-version storage. The only realtime scope in this phase is trust-change fanout to same-account active devices.
</strategy>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend the device record and key upload path</name>
  <files>src/devices/device-model.ts, src/devices/device-service.ts, src/devices/device-repository.ts, src/handlers/http/devices-keys.ts, tests/unit/device-key-service.test.ts, tests/integration/keys-upload.test.ts</files>
  <behavior>
    - PUT /devices/{deviceId}/keys accepts structured identity key and signed prekey JSON, validated with zod and the existing auth guard.
    - A trusted same-account caller can replace the current active key state for the target device by updating the existing device item.
    - Invalid input, unauthorized callers, and missing device ownership reuse the existing AppError/http-response contract instead of inventing new status codes.
  </behavior>
  <action>
    Extend the current device record with active key-state fields on the existing item, and add the upload handler/service path that replaces the current key material in one write.

    Keep the public key payload JSON-structured, not binary, and keep the route scope limited to key upload/replacement only. The implementation must reuse the established authenticated device flow and preserve the same-account trust boundary already used by device management.
  </action>
  <verify>
    <automated>npm test -- tests/unit/device-key-service.test.ts tests/integration/keys-upload.test.ts</automated>
  </verify>
  <done>
    Device key upload works end to end, current key state is persisted on the existing device item, and the phase has coverage for both the service behavior and the HTTP contract.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add atomic one-time prekey consume and bootstrap retrieval</name>
  <files>src/devices/device-repository.ts, src/devices/device-service.ts, src/handlers/http/devices-bootstrap.ts, tests/unit/key-bundle-repository.test.ts, tests/integration/keys-bootstrap.test.ts</files>
  <behavior>
    - GET /users/{userId}/devices/{deviceId}/bootstrap returns the current key-state envelope plus exactly one one-time prekey.
    - Two concurrent fetches never return the same one-time prekey; conditional contention is retried against the remaining candidate set before surfacing depletion.
    - When the one-time prekey pool is exhausted, the handler returns 409 CONFLICT rather than a partial bundle or retry token.
  </behavior>
  <action>
    Store one-time prekeys as sibling records in the same user/device partition and implement atomic consume semantics with DynamoDB conditional delete or transactional write behavior.

    Shape the bootstrap response as a JSON envelope containing the current key state plus one consumable one-time prekey. Keep this phase intentionally narrow: no request-id idempotency, no reservation tokens, and no bundle history.
  </action>
  <verify>
    <automated>npm test -- tests/unit/key-bundle-repository.test.ts tests/integration/keys-bootstrap.test.ts</automated>
  </verify>
  <done>
    Bootstrap retrieval is safe under concurrency, returns one and only one one-time prekey per success, and correctly returns 409 when the pool is empty.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add trust-change publishing and WebSocket fanout</name>
  <files>src/realtime/connection-registry.ts, src/realtime/trust-change-publisher.ts, src/devices/device-service.ts, src/handlers/http/devices-register.ts, src/handlers/http/devices-revoke.ts, src/handlers/http/devices-keys.ts, package.json, package-lock.json, tests/unit/trust-change-publisher.test.ts, tests/integration/trust-events.test.ts</files>
  <behavior>
    - Key upload, device revoke, and trust registration changes each emit a minimal trust-change event with only changeType, deviceId, and timestamp.
    - Events fan out to same-account active devices through a reusable connection registry and the API Gateway Management API client.
    - Stale connections are removed on delivery failure, and the publisher stays isolated from HTTP validation concerns.
  </behavior>
  <action>
    Add a dedicated realtime abstraction for connection lookup and WebSocket delivery, then call it from the device service after the persistence write succeeds.

    Add the API Gateway Management API dependency now rather than deferring it, because the locked Phase 3 decision is direct WebSocket fanout for trust-change events. Keep the publisher minimal and do not expand the event payload beyond the locked contract.
  </action>
  <verify>
    <automated>npm test -- tests/unit/trust-change-publisher.test.ts tests/integration/trust-events.test.ts</automated>
  </verify>
  <done>
    Trust-change events are emitted from the service layer and delivered to same-account active devices over the new realtime path with minimal payload semantics.</done>
</task>

</tasks>

<verification>
Run the focused phase tests first, then the full repository suite before handing the plan to execution:

- `npm test -- tests/unit/device-key-service.test.ts tests/unit/key-bundle-repository.test.ts tests/unit/trust-change-publisher.test.ts tests/integration/keys-upload.test.ts tests/integration/keys-bootstrap.test.ts tests/integration/trust-events.test.ts`
- `npm test`

The phase is ready only when all three requirement clusters are covered by passing tests and the plan file cleanly captures the atomic prekey consume and trust-fanout decisions.
</verification>

<success_criteria>
The phase is complete when the backend can upload active device key material, bootstrap a session with exactly one consumable one-time prekey, and emit minimal trust-change events to same-account active devices without touching messaging relay or group messaging scope.
</success_criteria>

<output>
After completion, create `.planning/phases/03-signal-key-lifecycle-and-bootstrap/03-SUMMARY.md`.
</output>