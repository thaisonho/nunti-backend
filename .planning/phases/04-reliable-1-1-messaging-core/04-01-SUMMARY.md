---
phase: "04"
plan: "01"
subsystem: messaging-transport
tags:
  - websocket
  - direct-messaging
  - connection-registry
  - relay
requires:
  - connection-registry
  - auth-guard
  - dynamodb
provides:
  - websocket-auth-context
  - device-connection-registry
  - message-model-contracts
  - message-repository
  - message-service
  - message-relay-publisher
  - ws-connect-handler
  - ws-disconnect-handler
  - ws-sendmessage-handler
affects:
  - connection-registry (extended with device awareness)
  - app-config (added messagesTableName)
tech_stack:
  added:
    - "@aws-sdk/client-apigatewaymanagementapi (installed)"
  patterns:
    - "dual-record DDB pattern (MSG + INBOX)"
    - "device-targeted WebSocket relay"
    - "flat eventType envelope"
key_files:
  created:
    - src/auth/websocket-auth.ts
    - src/messages/message-model.ts
    - src/messages/message-repository.ts
    - src/messages/message-service.ts
    - src/realtime/message-relay-publisher.ts
    - src/handlers/ws/connect.ts
    - src/handlers/ws/disconnect.ts
    - src/handlers/ws/messages.ts
    - tests/unit/websocket-auth.test.ts
    - tests/unit/connection-registry.test.ts
    - tests/unit/message-service.test.ts
    - tests/unit/message-relay-publisher.test.ts
  modified:
    - src/app/config.ts
    - src/realtime/connection-registry.ts
    - tests/unit/key-bundle-repository.test.ts
key_decisions:
  - "Device-aware connections stored with deviceId attribute — filter-based lookup preserves backward-compatible trust-change fanout while enabling device-targeted delivery"
  - "Dual-record DDB pattern (MSG + INBOX) designed upfront to avoid migration — inbox records enable oldest-first replay queries in Wave 3"
  - "WebSocket auth supports both Authorization header and query-param token to accommodate clients that cannot set custom headers"
requirements_completed:
  - MSG-01
duration: "7 min"
completed: "2026-04-01"
---

# Phase 04 Plan 01: WebSocket Transport Substrate Summary

Device-aware connection registry, typed direct-message contracts, and live relay plumbing with accepted/delivered/accepted-queued delivery semantics over API Gateway WebSocket.

**Duration:** ~7 min | **Start:** 2026-04-01T16:23:00Z | **End:** 2026-04-01T16:30:21Z
**Tasks:** 2/2 complete | **Files:** 15 created/modified | **Tests:** 28 new (101 total passing)

## What Was Built

### Task 1: WebSocket Identity and Message Contracts
- WebSocket auth helper bridging Cognito JWT verification into WebSocket $connect events
- Connection registry extended with `putConnection()` and `listDeviceConnections()` while preserving backward-compatible `listActiveConnections()` for trust-change fanout
- Typed message contracts: `DirectMessageRequest`, `DirectMessageEvent`, `DeliveryStatusEvent`, `ReplayCompleteEvent`, `WebSocketErrorEvent`
- Delivery state machine: `accepted → delivered | accepted-queued → delivered | failed`

### Task 2: Live Direct-Message Relay Plumbing
- Message repository with dual-record DynamoDB pattern (MSG for lookups, INBOX for ordered queries)
- Message service orchestrating persist → relay → state-update → sender-notify flow
- Relay publisher targeting specific device connections with GoneException cleanup
- WebSocket handlers: connect (auth + register), disconnect (cleanup), sendMessage (validate + relay)

## Deviations from Plan

- **[Rule 3 - Blocking]** `@aws-sdk/client-apigatewaymanagementapi` was listed in package.json but not installed — ran `npm install` to unblock both existing and new tests
- **[Rule 2 - Missing Critical]** Existing `key-bundle-repository.test.ts` broke because `MESSAGES_TABLE_NAME` is now required — added the env var to its test setup

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical). **Impact:** No behavioral changes to existing code; only config extension and dependency installation.

## Issues Encountered

None.

## Next Phase Readiness

Ready for 04-02 (idempotent retry and delivery-state awareness). The message repository, service, and relay publisher are designed to accept conditional writes and retry suppression in Wave 2.

## Self-Check: PASSED
