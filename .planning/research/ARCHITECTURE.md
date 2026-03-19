# Architecture Research

**Domain:** AWS-based Signal-enabled E2EE messaging backend
**Researched:** 2026-03-19
**Confidence:** HIGH

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

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Amazon Cognito | JWT-based auth for API access; claims propagated to route handlers | Use User Pool tokens and explicit claim checks for device-level operations |
| API Gateway WebSocket + @connections | Route invocation for ingress, management API for server-initiated callback messages | $connect/$disconnect lifecycle is core for presence and connection index |
| DynamoDB + Streams | Durable metadata/envelopes in tables; stream consumers for retries and side effects | Streams provide near-real-time change capture and ordered per-item mutation sequence |
| Signal specs/libsignal | Client cryptography and protocol state transitions | Server handles public key distribution, prekey consumption, and encrypted envelope transport only |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| transport ↔ auth | direct API call | transport must not parse JWT internals directly |
| transport ↔ messaging | command DTO | keep route schema decoupled from storage schema |
| signal ↔ persistence | repository API | isolate conditional writes and key depletion invariants |
| messaging ↔ delivery | event contract (stored envelope id + routing metadata) | enables durable-then-push and retries |
| streams workers ↔ delivery | async invocation/event | required for idempotent replay and dead-letter recovery |

## Suggested Build Order (Roadmap Implications)

1. **Identity + Connection Foundation**
   - Build Cognito integration, WebSocket $connect/$disconnect handlers, and connection index table.
   - Reason: all later flows depend on trusted principal/device mapping.
2. **Signal Key Management Plane**
   - Implement device registration, signed prekey and one-time prekey upload/fetch/consume.
   - Reason: session bootstrap must exist before meaningful encrypted messaging.
3. **1:1 Envelope Pipeline (Durable then Push)**
   - Implement send route, envelope validation, durable message storage, then online delivery via @connections.
   - Reason: establishes the core reliability model and offline sync basis.
4. **Reconnect Sync + Receipts**
   - Add pending-envelope fetch on reconnect and encrypted receipt events.
   - Reason: completes consistency loop across multi-device and intermittent connectivity.
5. **Group Messaging Fan-out**
   - Add per-device fan-out semantics, sender-key update routing, and membership metadata boundaries.
   - Reason: group complexity should build on validated 1:1 primitives.
6. **Async Hardening and Operations**
   - Add DynamoDB Streams workers, retry/DLQ handling, abuse controls, and observability dashboards.
   - Reason: production-like resilience comes last once core behavior is stable.

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

---
*Architecture research for: AWS-based Signal-enabled E2EE messaging backend*
*Researched: 2026-03-19*
