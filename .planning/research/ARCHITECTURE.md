# Architecture Research

**Domain:** AWS-based Signal-enabled E2EE messaging backend (v1.1 live launch integration)
**Researched:** 2026-04-02
**Confidence:** MEDIUM-HIGH

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Client / Edge Layer                            │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐        ┌───────────────────────────────────────┐ │
│  │ Mobile/Web Clients   │        │ AWS API Gateway WebSocket API        │ │
│  │ (libsignal runtime)  │◄──────►│ Routes: $connect/$disconnect/$default │ │
│  └──────────┬───────────┘        └──────────────────┬────────────────────┘ │
│             │                                        │                      │
│             │ JWT (Cognito User Pool)               │ WebSocket events     │
├─────────────┴────────────────────────────────────────┴──────────────────────┤
│                          Application / Orchestration                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┐  ┌──────────────────────────┐                 │
│  │ Auth & Connection Lambda │  │ Signaling Lambda         │                 │
│  │ (connect/presence policy)│  │ (prekeys/session setup)  │                 │
│  └──────────────┬───────────┘  └──────────────┬───────────┘                 │
│                 │                             │                             │
│  ┌──────────────▼───────────┐  ┌──────────────▼───────────┐                 │
│  │ Message Lambda           │  │ Delivery Lambda          │                 │
│  │ (store envelope + ACL)   │  │ (push via @connections)  │                 │
│  └──────────────┬───────────┘  └──────────────┬───────────┘                 │
│                 │                             │                             │
│                 └──────────┬──────────────────┘                             │
│                            │                                                │
│                    ┌───────▼────────┐                                       │
│                    │ API GW Mgmt API│                                       │
│                    │ POST @connections                                      │
│                    └────────────────┘                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                 Data Layer                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ │
│  │ DynamoDB: Identity   │ │ DynamoDB: DeviceKeys │ │ DynamoDB: Messages   │ │
│  │ + Device registry    │ │ PreKey/SignedPreKey  │ │ Ciphertext envelopes │ │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────┘ │
│  ┌──────────────────────┐ ┌──────────────────────┐                          │
│  │ DynamoDB: ConnIndex  │ │ DynamoDB Streams     │                          │
│  │ user/device->connIds │ │ fan-out/retry hooks  │                          │
│  └──────────────────────┘ └──────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Cognito User Pool | User authentication and JWT issuance | Cognito hosted auth or SRP/OIDC flow, token validation in API entry layer |
| API Gateway WebSocket API | Long-lived bidirectional channel, route dispatch | Route selection expression on message action, special routes $connect/$disconnect/$default |
| Auth & Connection Service | Authorize connection, bind user/device to connectionId, cleanup on disconnect | Lambda on $connect/$disconnect + DynamoDB connection index |
| Signal Key Service | Manage identity keys, signed prekeys, one-time prekeys, key bundle fetch/consume | Lambda + DynamoDB tables with conditional writes and depletion monitoring |
| Message Ingress Service | Validate envelope metadata, enforce sender/recipient policy, persist encrypted envelopes | Lambda route handler writing DynamoDB message table |
| Delivery Service | Online fan-out via @connections and offline fallback marker | Lambda using ApiGatewayManagementApi POST /@connections/{connectionId} |
| State Store (DynamoDB) | Durable protocol state metadata and encrypted message envelopes | Single-table or bounded multi-table model with TTL for ephemeral items |
| Event Reactor | React to writes and async retries/dead-letter handling | DynamoDB Streams -> Lambda for delivery attempts, metrics, and repair tasks |

## Milestone v1.1 Integration Scope

### New vs Modified Components

| Type | Component | Integration Point | Why in v1.1 |
|------|-----------|-------------------|-------------|
| New | Deployment pipeline workflow | Source control -> build/test -> deploy by environment | Repeatable live launch and rollback readiness |
| New | Environment separation model | Stage-scoped stack config and resource naming | Prevent cross-environment data/policy bleed |
| New | Runtime verification suite | Post-deploy execution against live websocket/API endpoints | Close v1.0 debt around real AWS behavior |
| New | Ops dashboard and alarms | CloudWatch metrics/logs -> alerting | Detect fanout/replay/auth drift early |
| Modified | `src/app/config.ts` contract | Add strict environment key validation for live stages | Production-safe defaults and fail-fast startup |
| Modified | `src/handlers/ws/messages.ts` and sibling routes | Enforce stable authorizer-context assumptions in deployed API Gateway config | Resolve external-context propagation risk |
| Modified | `src/realtime/message-relay-publisher.ts` and `src/realtime/group-relay-publisher.ts` | Add per-outcome telemetry and bounded retry policy | Improve operability under stale connections/churn |
| Modified | `src/auth/jwt-verifier.ts` and `src/auth/auth-guard.ts` | Harden claim checks and stage-specific issuer/client config | IAM and auth hardening for live operation |

## Recommended Project Structure

```text
src/
├── auth/                       # Cognito token verification + authz policy
│   ├── authorizers/            # WebSocket/Lambda authorizer logic
│   └── claims/                 # JWT claim parsing and access scopes
├── transport/                  # API Gateway WebSocket route adapters
│   ├── routes/                 # $connect/$disconnect/$default + custom actions
│   └── gateway-management/     # @connections send/get/delete wrappers
├── signal/                     # Signal protocol server-side metadata logic
│   ├── prekeys/                # upload/fetch/consume one-time keys
│   ├── sessions/               # session bootstrap metadata flows
│   └── devices/                # multi-device identity mapping
├── messaging/                  # message envelope ingest, queueing, fan-out
│   ├── ingest/                 # validate and persist encrypted envelopes
│   ├── delivery/               # online delivery + retries
│   └── receipts/               # encrypted delivery/read receipt metadata
├── persistence/                # DynamoDB access patterns and repositories
│   ├── tables/                 # schema constants/index names
│   ├── repositories/           # typed data access abstraction
│   └── streams/                # stream consumers and idempotency guards
├── observability/              # logs/metrics/tracing/security audit events
└── shared/                     # DTOs, errors, utility and protocol constants
```

### Structure Rationale

- **auth/** isolates identity validation from messaging logic, reducing auth bypass risk.
- **transport/** isolates API Gateway contracts from domain services, allowing route evolution without domain churn.
- **signal/** keeps cryptographic lifecycle metadata cohesive and testable as protocol rules evolve.
- **messaging/** separates ingest from delivery for easier retries and backpressure control.
- **persistence/** centralizes table/index decisions and idempotency patterns to avoid query sprawl.

## Architectural Patterns

### Pattern 1: Route-Oriented Transport Adapter

**What:** API Gateway WebSocket route keys map to thin transport handlers that call domain services.
**When to use:** Always for serverless WebSocket backends with multiple action types.
**Trade-offs:** Clear boundaries and testability; slightly more boilerplate than direct Lambda-all-in-one handlers.

**Example:**
```typescript
export async function onWebSocketEvent(event: WsEvent) {
  switch (event.requestContext.routeKey) {
    case "$connect":
      return connectService.handle(event);
    case "$disconnect":
      return disconnectService.handle(event);
    default:
      return routeDispatcher.dispatch(event.body?.action, event);
  }
}
```

### Pattern 2: Stateless Crypto Boundary

**What:** Server stores only encrypted payloads and Signal protocol metadata needed for asynchronous session establishment; clients perform all plaintext encryption/decryption.
**When to use:** Mandatory for E2EE systems targeting Signal-style trust model.
**Trade-offs:** Strong confidentiality and reduced breach impact; harder server-side moderation/search capabilities.

**Example:**
```typescript
await messageRepo.put({
  conversationId,
  recipientDeviceId,
  envelopeCiphertext,
  envelopeType,
  senderDeviceId,
  createdAt,
});
```

### Pattern 3: Write-Then-Deliver (Durability First)

**What:** Persist encrypted envelope before online push; delivery attempts are derived from durable state.
**When to use:** Any chat system requiring offline sync and at-least-once delivery semantics.
**Trade-offs:** Slightly higher write latency; much stronger crash recovery and retry behavior.

## Data Flow

### Request Flow

```text
[Client send encrypted envelope]
    ↓ WebSocket frame (JWT-authenticated session)
[API Gateway route selection]
    ↓
[Message Ingress Lambda]
    ↓ validate sender policy + recipient mapping
[DynamoDB Messages write (durable)]
    ↓
[Delivery Lambda resolves recipient connectionIds]
    ↓
[API Gateway Management API POST @connections]
    ↓
[Recipient client receives ciphertext envelope]
```

### State Management

```text
[Cognito user/device identity]
    ↓
[Connection index in DynamoDB]
    ↓ subscribe/read by Delivery Service
[Message/state writes]
    ↓
[DynamoDB Streams]
    ↓
[Retry/repair Lambda workers]
```

### Operational Flow (new in v1.1)

```text
[Commit to main/develop]
    ↓
[CI: lint/test/build]
    ↓
[Deploy to dev stack]
    ↓
[Run live AWS verification suite]
    ↓ pass
[Promote to staging]
    ↓ pass
[Promote to prod]
    ↓
[Observe alarms + rollback trigger if needed]
```

### Key Data Flows

1. **Connection lifecycle:** Client opens WebSocket -> $connect authorizes token -> connectionId bound to userId/deviceId in connection index -> $disconnect removes binding.
2. **Prekey publishing:** Device uploads signed prekey and one-time prekeys -> service validates ownership/signature metadata -> keys stored with depletion counters.
3. **Session bootstrap (X3DH/PQXDH):** Sender requests recipient key bundle -> server returns public key material only -> sender constructs initial encrypted message for target device.
4. **Message delivery path:** Sender posts encrypted envelope -> durable write -> online devices receive via @connections -> offline devices fetch pending encrypted envelopes on reconnect.
5. **Group fan-out:** Sender envelope per recipient device (or sender-key update envelopes) persisted -> delivery service fan-outs per active connection with idempotent delivery tokens.
6. **Receipt/update flow:** Recipient emits encrypted receipt event -> ingress persists receipt envelope -> sender devices get receipt via same durable-then-push pipeline.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single AWS account/region, simple table-per-domain (messages, keys, connections), direct Lambda handlers are fine. |
| 1k-100k users | Enforce strict partition-key design, add async delivery workers from DynamoDB Streams, enable TTL for transient records, add dead-letter queues. |
| 100k+ users | Move to multi-region strategy, shard hot conversations, separate delivery worker pool from ingress, add explicit rate controls and abuse protection tiers. |

### Scaling Priorities

1. **First bottleneck:** Hot partitions in message and connection-index tables; fix with partition design by conversation/device and write sharding where needed.
2. **Second bottleneck:** Delivery fan-out concurrency and stale connection handling; fix with async worker pools, bounded retries, and aggressive stale-connection cleanup.

## Anti-Patterns

### Anti-Pattern 1: Server-Side Plaintext Touch

**What people do:** Decrypt content in Lambda for business logic convenience.
**Why it's wrong:** Breaks E2EE trust model and massively increases breach impact.
**Do this instead:** Keep server logic envelope-metadata-only; enforce that content remains opaque ciphertext.

### Anti-Pattern 2: Connection ID as Durable Identity

**What people do:** Treat API Gateway connectionId as stable user identity.
**Why it's wrong:** Connection IDs are ephemeral and rotate frequently; causes ghost sessions and delivery loss.
**Do this instead:** Maintain explicit userId/deviceId <-> connectionId mapping with TTL/heartbeat cleanup.

## Integration Points

### External Services

| Service | Integration Pattern | v1.1 Change |
|---------|---------------------|-------------|
| Amazon Cognito | JWT-based auth for API access; claims propagated to route handlers | Harden claim validation and stage-specific issuer/client settings |
| API Gateway WebSocket + @connections | Route invocation for ingress, management API for server-initiated callback messages | Validate stage config so non-connect routes preserve expected auth context |
| DynamoDB + Streams | Durable metadata/envelopes in tables; stream consumers for retries and side effects | Keep schema patterns, but separate tables per environment and add alarms |
| CloudWatch logs/metrics/alarms | Service observability and production alerting | Add dashboards and alerts for auth failures, relay failures, replay backlog |
| Signal specs/libsignal | Client cryptography and protocol state transitions | No model change; validate runtime interoperability in deployed environment |

### Internal Boundaries

| Boundary | Communication | v1.1 Integration Note |
|----------|---------------|-----------------------|
| handlers/ws ↔ auth | direct API call | verify deployed authorizer mapping consistency across connect and non-connect routes |
| handlers/ws ↔ messaging | command DTO | keep route schema decoupled from storage schema; add latency/error telemetry |
| signal ↔ persistence | repository API | preserve conditional writes and key depletion invariants |
| messaging ↔ delivery | event contract (stored envelope id + routing metadata) | add delivery outcome tags for runtime verification observability |
| streams workers ↔ delivery | async invocation/event | required for idempotent replay and dead-letter recovery |
| runtime verifier ↔ deployed stack | black-box test calls | promotion gate from dev to staging to prod |

## Suggested Build Order (Risk-Minimizing for v1.1)

1. **Define stage isolation and config contract**
    - Create explicit `dev`/`staging`/`prod` resource boundaries, env vars, and IAM scopes.
    - Dependency reason: all later rollout and verification relies on stable environment identity.
2. **Introduce CI build + artifact promotion pipeline**
    - Produce immutable deploy artifacts and deterministic deployment steps.
    - Dependency reason: required before safe iterative live changes.
3. **Deploy current v1.0 runtime to `dev` without behavior changes**
    - Lift-and-shift first to expose pure infrastructure mismatches.
    - Dependency reason: separates infra risk from feature/hardening risk.
4. **Add live runtime verification gates**
    - Automate checks for websocket auth context, fanout/replay, trust-change, and attachments.
    - Dependency reason: closes known v1.0 human-verification debt before promotion.
5. **Apply runtime hardening changes**
    - Tighten auth claims, logging redaction, relay telemetry, and failure handling.
    - Dependency reason: safer after baseline behavior is measured in deployed env.
6. **Progressive promotion (`dev` -> `staging` -> `prod`)**
    - Require verification pass + alarm baseline before each promotion.
    - Dependency reason: minimizes blast radius and shortens incident triage loops.
7. **Operationalize recurring verification and rollback drills**
    - Schedule verification runs and recovery playbook exercises.
    - Dependency reason: sustains launch safety after initial go-live.

## Sources

- AWS API Gateway WebSocket APIs: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html
- API Gateway WebSocket routes and route selection expressions: https://docs.aws.amazon.com/apigateway/latest/developerguide/websocket-api-develop-routes.html
- API Gateway connection lifecycle ($connect/$disconnect): https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html
- API Gateway @connections management API: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html
- AWS Lambda overview (event-driven serverless): https://docs.aws.amazon.com/lambda/latest/dg/welcome.html
- Amazon DynamoDB overview: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html
- DynamoDB Streams (change data capture): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html
- Amazon Cognito overview: https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html
- Cognito with API Gateway authorization guidance: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-accessing-resources-api-gateway-and-lambda.html
- Signal technical specifications index (X3DH, PQXDH, Double Ratchet, Sesame): https://signal.org/docs/
- Milestone context: `.planning/PROJECT.md` and `.planning/MILESTONES.md`

---
*Architecture research for: v1.1 Live AWS Launch integration*
*Researched: 2026-04-02*
