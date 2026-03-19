# Project Research Summary

**Project:** AWS E2EE Messaging Backend
**Domain:** AWS serverless end-to-end encrypted messaging backend (Signal protocol)
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

This project is a security-first backend for end-to-end encrypted messaging, where the server acts as an authenticated relay and state coordinator rather than a plaintext processor. The strongest expert pattern across the research is consistent: keep cryptography client-side, keep server data ciphertext-and-metadata only, and use managed AWS primitives (API Gateway WebSocket, Lambda, DynamoDB, Cognito, SQS/S3/KMS) to reduce operational risk while the team validates protocol correctness.

The recommended implementation approach is to build in strict dependency order: identity/device trust foundation first, then prekey/session bootstrap, then durable message ingest and delivery fanout, then reconnect/receipt consistency, then group and attachment scale-hardening. This sequencing matches both architecture dependencies and feature expectations, and it minimizes rework by validating the durable-then-push pattern early.

The key risks are protocol-state correctness under concurrency, unsafe token validation, and metadata leakage through logs/retries. Mitigation should be treated as first-class scope, not post-launch hardening: atomic one-time prekey consumption, idempotent write paths, optimistic locking/ordering controls, strict JWT claim verification, and explicit redaction policies with CI checks.

## Key Findings

### Recommended Stack

The stack is strongly convergent around AWS-managed serverless transport and state services plus modern Node runtime/tooling. API Gateway WebSocket and Lambda are the standard control plane for bidirectional realtime messaging, DynamoDB handles low-latency metadata/state persistence, and Cognito provides native token-based identity with reduced custom auth surface area.

For message and attachment durability, SQS FIFO and S3+KMS complete the baseline reliability and encrypted storage pattern. Supporting libraries should remain conservative and current: AWS SDK v3, Powertools, Middy, Zod, and Signal-maintained libsignal bindings.

**Core technologies:**
- Amazon API Gateway WebSocket API: realtime bidirectional transport for messaging events and presence lifecycle, with AWS-native routing model.
- AWS Lambda (nodejs24.x preferred): stateless orchestration for connect/disconnect/auth, key management, ingest, and delivery workers.
- Amazon DynamoDB: durable metadata/state store for keys, device mapping, encrypted envelopes, and connection indexes with conditional writes.
- Amazon Cognito User Pools: JWT identity/authentication baseline with OIDC/OAuth semantics for secure API access.
- Amazon SQS FIFO: ordered asynchronous delivery/retry pipeline to preserve per-conversation/device processing guarantees.
- Amazon S3 + AWS KMS: encrypted attachment blob persistence and envelope-key custody controls.

### Expected Features

Feature research confirms that launch credibility depends on getting core E2EE lifecycle right before adding advanced privacy differentiators. Table stakes in 2026 include robust 1:1 and group encrypted transport, asynchronous session bootstrap, multi-device consistency, attachment envelope flow, trust-change signaling, and abuse controls.

Differentiators are valuable but should follow core correctness: username-first privacy, sealed-sender-like metadata minimization, optional E2EE backup, and post-quantum migration readiness.

**Must have (table stakes):**
- Identity and device registration with signed key binding.
- Prekey bundle service and asynchronous session bootstrap.
- Reliable encrypted 1:1 and group message transport with delivery metadata.
- Multi-device fanout and trust-change signaling.
- Encrypted attachment envelope transport.
- Baseline abuse controls (rate limit, unknown-sender gating, block/report).

**Should have (competitive):**
- Username-first contact discovery with anti-enumeration.
- Sealed-sender-style sender-metadata minimization.
- Optional user-controlled E2EE backup.
- Group admin security policies and adaptive trust/risk signaling.

**Defer (v2+):**
- Full post-quantum migration rollout.
- Transparency log style attestations at production scale.

### Architecture Approach

Architecture should follow a route-adapter plus domain-service model: transport handlers stay thin, domain services enforce crypto-state and policy invariants, and persistence modules centralize DynamoDB access/idempotency patterns. The core behavioral pattern is write-then-deliver (durability first): every ciphertext envelope is persisted before realtime push, with retries and offline sync derived from durable state.

**Major components:**
1. Identity and connection plane: Cognito-backed auth plus WebSocket connect/disconnect lifecycle and user/device to connection mapping.
2. Signal key plane: signed prekey and one-time prekey lifecycle, key bundle serving, and device trust metadata.
3. Messaging plane: encrypted envelope ingest, durable storage, online fanout, reconnect sync, and receipt propagation.
4. Data and event plane: DynamoDB tables/indexes plus Streams/SQS workers for retries, repair, and operational resilience.
5. Security and observability plane: strict JWT verification, redacted logs, metrics/tracing, and incident-response hooks.

### Critical Pitfalls

1. **One-time prekey reuse or non-atomic consumption** - enforce conditional/transactional OPK consume and automatic low-watermark replenishment.
2. **Ratchet state races under Lambda concurrency** - serialize by conversation/device key and use versioned conditional writes with retry-safe conflict handling.
3. **Assuming exactly-once execution** - make ingest and delivery idempotent with deterministic operation keys and first-write-wins persistence.
4. **Weak JWT validation (signature-only)** - centralize verifier and enforce issuer, audience/client, token_use, expiry, and scope checks per endpoint.
5. **Metadata leakage via logs/DLQ** - use strict log allowlists, payload redaction, and encrypted/minimal retry artifacts.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Security Baseline and Trust Contract
**Rationale:** Security invariants must be locked before feature expansion to avoid architectural rework.
**Delivers:** Threat model, crypto boundary policy, redaction policy, strict auth contract definitions.
**Addresses:** Foundational trust for all table-stake features.
**Avoids:** X3DH replay handling gaps, metadata leakage, and ambiguous server plaintext boundaries.

### Phase 2: Identity, Auth, and Connection Foundation
**Rationale:** All messaging behavior depends on authenticated user/device identity and connection lifecycle correctness.
**Delivers:** Cognito integration, JWT verifier, connect/disconnect handlers, connection index model.
**Uses:** Cognito, API Gateway WebSocket, Lambda, DynamoDB.
**Implements:** Identity and connection plane.

### Phase 3: Signal Key Management and Session Bootstrap
**Rationale:** Prekey lifecycle is the dependency gate for asynchronous E2EE start flows.
**Delivers:** Device key registration, signed prekey and OPK upload/consume, key bundle APIs, depletion monitoring.
**Addresses:** Prekey/session bootstrap table-stake feature.
**Avoids:** OPK reuse/drain and replay-window bootstrap weaknesses.

### Phase 4: Durable 1:1 Messaging Pipeline and Reliability Controls
**Rationale:** Core product value is reliable encrypted messaging; durability-first pipeline establishes correctness baseline.
**Delivers:** Ingest validation, durable envelope persistence, online delivery via @connections, idempotent retries, ordering controls.
**Addresses:** 1:1 messaging, delivery metadata correctness, offline tolerance primitives.
**Avoids:** Duplicate delivery, ratchet state races, stale connection retry storms.

### Phase 5: Multi-Device, Group, Attachments, and Reconnect Sync
**Rationale:** Group and multi-device complexity should build on proven 1:1 primitives and stable ordering semantics.
**Delivers:** Per-device fanout, membership event handling, encrypted attachment pointer flow, reconnect backlog sync, receipts.
**Addresses:** Group messaging, attachment transport, multi-device consistency, trust-change signaling.
**Avoids:** Divergent device histories and ghost/expired-state behavior.

### Phase 6: Abuse Resistance, Recovery Operations, and v1.x Differentiators
**Rationale:** Production-hardening and differentiators are highest leverage after core protocol correctness is validated.
**Delivers:** Abuse-control expansion, compromise revoke/rekey runbooks, disappearing-message hardening, username privacy track, backup design prep.
**Addresses:** Safety, reliability, and competitive enhancements.
**Avoids:** Incident-response paralysis and uncontrolled abuse growth.

### Phase Ordering Rationale

- Identity and auth must precede key distribution; key distribution must precede encrypted messaging.
- Write-then-deliver 1:1 flow should be validated before layering group and multi-device fanout complexity.
- Reliability and idempotency controls are placed with core pipeline implementation to prevent accumulating state corruption debt.
- Differentiators are intentionally deferred until core E2EE transport correctness and recovery operations are verified.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** Atomic OPK consumption and depletion strategy under high concurrency.
- **Phase 4:** Ordering and idempotency design under Lambda + DynamoDB Streams/SQS retry behavior.
- **Phase 6:** Username privacy anti-enumeration and optional E2EE backup threat model/UX boundaries.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Cognito + API Gateway + Lambda auth/connect patterns are mature and well documented.
- **Phase 5 (attachment storage portion):** S3 + KMS encrypted object storage pattern is standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | AWS service choices and runtime/library recommendations are grounded in official docs and current package metadata. |
| Features | MEDIUM-HIGH | Feature set is strongly validated by leading secure messengers, but product-level trade-offs remain context dependent. |
| Architecture | HIGH | Patterns are mature for serverless realtime systems and map directly to AWS integration boundaries. |
| Pitfalls | MEDIUM-HIGH | Risks are well-known and source-backed, but real severity distribution depends on implementation quality and load profile. |

**Overall confidence:** HIGH

### Gaps to Address

- Throughput/cost crossover for pure API Gateway WebSocket versus hybrid dedicated websocket edge under sustained high concurrency.
- Exact DynamoDB partition and sharding strategy for hot-group traffic patterns.
- Concrete compromise-response SLOs and operational ownership model for team incident handling.
- Scope boundary for backup and post-quantum readiness in v1.x versus v2 commitments.

## Sources

### Primary (HIGH confidence)
- AWS Lambda runtime and best-practice documentation - runtime targeting, idempotency, and retry behavior.
- AWS API Gateway WebSocket documentation - route model, lifecycle, and @connections delivery semantics.
- AWS DynamoDB documentation - consistency model, streams, and TTL caveats.
- AWS Cognito documentation - token verification and claim validation requirements.
- Signal protocol specifications (X3DH, Double Ratchet) - key lifecycle and session security requirements.

### Secondary (MEDIUM confidence)
- Signal support documentation - trust-change UX, disappearing messages, phone-number privacy, and multi-device behavior.
- WhatsApp and Apple security overviews - comparative feature baseline and user expectation signals.

### Tertiary (LOW confidence)
- Workload-threshold guidance for hybrid websocket edge migration - requires project-specific load testing to validate.

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
