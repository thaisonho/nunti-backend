---
phase: 04-reliable-1-1-messaging-core
verified: 2026-04-01T16:58:59Z
status: passed
score: 10/10 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "Queued messages that exceed the retention policy become terminal failed outcomes tied to messageId."
  gaps_remaining: []
  regressions: []
---

# Phase 04: Reliable 1:1 Messaging Core Verification Report

**Phase Goal:** Users can exchange encrypted direct messages in real time with durable retry-safe delivery behavior.
**Verified:** 2026-04-01T16:58:59Z
**Status:** passed
**Re-verification:** Yes - after gap closure

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Authenticated WebSocket connections are registered with both user and device identity so a sender can be traced to one trusted device. | ✓ VERIFIED | `src/auth/websocket-auth.ts`, `src/handlers/ws/connect.ts`, and `src/realtime/connection-registry.ts` extract `userId` and `deviceId` from the `$connect` event, persist them with the connection ID, and unit tests cover both auth extraction and registry shape. |
| 2 | A connected sender can deliver a 1:1 encrypted message through the WebSocket relay and receives an accepted or accepted-queued outcome immediately. | ✓ VERIFIED | `src/handlers/ws/messages.ts` validates the direct-message payload and calls `sendMessage`; `src/messages/message-service.ts` persists the record, relays it, and returns the sender-facing result. |
| 3 | An online recipient device receives the live relay push and the sender receives a delivered status when delivery succeeds. | ✓ VERIFIED | `src/realtime/message-relay-publisher.ts` targets device-scoped connections with `PostToConnectionCommand`, and `src/messages/message-service.ts` emits the sender `delivery-status` update after delivery. |
| 4 | Connection cleanup removes stale entries without breaking the existing same-account trust-change fanout path. | ✓ VERIFIED | `src/realtime/message-relay-publisher.ts` and `src/realtime/trust-change-publisher.ts` both prune `GoneException` connections, while `src/realtime/connection-registry.ts` preserves `listActiveConnections()` for trust fanout. |
| 5 | Retrying a send with the same messageId returns the prior outcome instead of creating duplicate queue items or duplicate relay side effects. | ✓ VERIFIED | `src/messages/message-repository.ts` uses a conditional put on `messageId`, and `src/messages/message-service.ts` returns the stored record without relaying or re-notifying on duplicates. |
| 6 | Sender-facing delivery acknowledgements reflect the real delivery state and stay stable across retries. | ✓ VERIFIED | `src/messages/message-service.ts` returns the stored `deliveryState` for retries and publishes delivery-status events from the canonical message result. |
| 7 | Queued messages that exceed the retention policy become terminal failed outcomes tied to messageId. | ✓ VERIFIED | `src/messages/message-service.ts` now calls `checkRetentionPolicy(record)` inside `replayBacklog()`, and `tests/integration/messages-failure.test.ts` proves expired queued records fail without relay attempts. |
| 8 | A reconnecting device receives every retained queued message in strict oldest-first order by server enqueue time. | ✓ VERIFIED | `src/messages/message-repository.ts` queries the inbox with `ScanIndexForward: true`, and `src/messages/message-service.ts` replays the backlog sequentially in that order. |
| 9 | The backend drains backlog replay before switching the connection back to live traffic. | ✓ VERIFIED | `src/handlers/ws/reconnect.ts` awaits `replayBacklog`, and `src/messages/message-service.ts` only emits `replay-complete` after the replay loop finishes. |
| 10 | A replay-complete event marks the end of catch-up so the client can resume normal message processing. | ✓ VERIFIED | `src/realtime/message-relay-publisher.ts` publishes the flat `replay-complete` event, and the reconnect handler uses it as the terminal boundary. |

**Score:** 9/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/auth/websocket-auth.ts` | Extract authenticated WebSocket user and device context | ✓ VERIFIED | Supports `Authorization` header and `token` query fallback, and requires `deviceId`. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/realtime/connection-registry.ts` | Device-aware connection registration and lookup | ✓ VERIFIED | Stores `userId`, `deviceId`, and `connectionId`; keeps backward-compatible same-account listing. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-model.ts` | Flat direct-message and delivery-event contracts | ✓ VERIFIED | Defines `DirectMessageRequest`, `DirectMessageEvent`, `DeliveryStatusEvent`, `ReplayCompleteEvent`, and `WebSocketErrorEvent`. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-repository.ts` | Conditional persistence and queued inbox query support | ✓ VERIFIED | Implements idempotent message creation, delivery-state updates, and oldest-first queued-message queries. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-service.ts` | Send, retry, retention, and replay orchestration | ✓ VERIFIED | `replayBacklog()` now gates each queued record through `checkRetentionPolicy()` before relay. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/realtime/message-relay-publisher.ts` | Live relay, sender status, and replay-complete publishing | ✓ VERIFIED | Uses API Gateway management API, device-scoped lookups, and GoneException cleanup. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/handlers/ws/connect.ts` | Authenticated device connection registration | ✓ VERIFIED | Extracts the WebSocket auth context and registers the connection. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/handlers/ws/messages.ts` | Direct-message send route | ✓ VERIFIED | Validates the request body and delegates to the message service. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/handlers/ws/reconnect.ts` | Reconnect replay route | ✓ VERIFIED | Rebuilds the connection context and blocks until backlog replay finishes. |
| `/home/json/hcmus/applied_crypto/nunti-backend/tests/unit/message-replay.test.ts` | Replay ordering and completion coverage | ✓ VERIFIED | Confirms backlog replay order and replay-complete emission. |
| `/home/json/hcmus/applied_crypto/nunti-backend/tests/integration/messages-dedup.test.ts` | Retry-suppression coverage | ✓ VERIFIED | Confirms same `messageId` returns the stored outcome without duplicate side effects. |
| `/home/json/hcmus/applied_crypto/nunti-backend/tests/integration/messages-reconnect.test.ts` | Reconnect replay coverage | ✓ VERIFIED | Confirms replay drains in order and emits the terminal boundary after relays. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/handlers/ws/connect.ts` | `/home/json/hcmus/applied_crypto/nunti-backend/src/realtime/connection-registry.ts` | registering authenticated device connections | WIRED | `extractWebSocketContext(...)` feeds `putConnection(...)`. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/handlers/ws/messages.ts` | `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-service.ts` | validated direct-message send request | WIRED | Parsed payload is passed to `sendMessage(...)`. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/realtime/message-relay-publisher.ts` | `/home/json/hcmus/applied_crypto/nunti-backend/src/realtime/connection-registry.ts` | device-targeted active connection lookup and stale-connection pruning | WIRED | Uses `listDeviceConnections(...)` and removes stale connections on `GoneException`. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-service.ts` | `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-repository.ts` | message persistence and queued inbox access | WIRED | `sendMessage(...)` and `replayBacklog(...)` both use repository primitives. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-service.ts` | `/home/json/hcmus/applied_crypto/nunti-backend/src/realtime/message-relay-publisher.ts` | sender/recipient realtime delivery events | WIRED | `sendMessage(...)` and `replayBacklog(...)` publish relay and status events. |
| `/home/json/hcmus/applied_crypto/nunti-backend/src/handlers/ws/reconnect.ts` | `/home/json/hcmus/applied_crypto/nunti-backend/src/messages/message-service.ts` | reconnect-triggered backlog replay request | WIRED | The handler awaits `replayBacklog(...)` before returning. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| MSG-01 | 04-01-PLAN.md | User can send and receive 1:1 encrypted messages through WebSocket relay. | ✓ SATISFIED | WebSocket connect/send handlers, relay publisher, and send-path tests confirm the live transport path. |
| MSG-02 | 04-02-PLAN.md | Backend supports delivery acknowledgement and idempotent retry behavior. | ✓ SATISFIED | Conditional message persistence and duplicate-send short-circuiting are implemented and tested. |
| MSG-03 | 04-03-PLAN.md | User receives queued encrypted messages after reconnect. | ✓ SATISFIED | Reconnect handler, replay loop, and replay-complete signaling are implemented and covered by tests. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | N/A | No TODO/FIXME/placeholders, empty handlers, null/empty stubs, or console-log-only implementations found in the phase files reviewed. | ℹ️ Info | No blocking anti-patterns detected. |

### Gaps Summary

No blocking gaps remain. The transport, idempotency, reconnect replay, and retention-aware failure paths are now wired and covered by tests.

---

_Verified: 2026-04-01T16:51:29Z_
_Verifier: Claude (gsd-verifier)_
