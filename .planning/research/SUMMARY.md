# Project Research Summary

**Project:** AWS E2EE Messaging Backend
**Domain:** Live AWS launch of a serverless Signal-style E2EE messaging backend
**Researched:** 2026-04-02
**Confidence:** MEDIUM-HIGH

## Executive Summary

This milestone is a launch-readiness effort, not a greenfield build. The product is an AWS serverless realtime messaging backend that handles ciphertext envelopes and protocol metadata while clients retain all plaintext cryptography responsibilities. Across stack, features, architecture, and pitfalls research, the expert pattern is clear: preserve the existing API Gateway WebSocket + Lambda + DynamoDB + Cognito architecture, then harden deployment, runtime validation, and security controls before production promotion.

The recommended approach is staged and dependency-driven: establish deterministic infrastructure and environment isolation first, then add observability and progressive rollout controls, then enforce security and data-correctness guarantees, and finally run release-blocking live AWS validation before promotion. This sequencing minimizes blast radius and separates infrastructure defects from runtime behavior regressions, which is critical for a milestone whose acceptance criteria are live fanout/replay/trust-change/attachment behavior.

The dominant risks are not feature gaps; they are operational correctness failures under real traffic: stale websocket connection handling, duplicate event side effects, claim-validation drift in JWT auth, and metadata leakage in telemetry. Mitigation must be built into v1.1 phases as required controls (idempotency keys, strict claim matrix, redaction policy checks, concurrency guardrails, alarm-gated promotion), not postponed to v1.1.x.

## Key Findings

### Recommended Stack

Research strongly supports an AWS-native launch stack with minimal architectural churn and maximum operational guardrails. The stack should keep current serverless primitives, upgrade runtime baseline to modern Lambda Node, and add deployment/observability/security tooling to turn the existing backend into a repeatable production system.

**Core technologies:**
- AWS CDK v2 (`aws-cdk-lib` 2.247.0 + `constructs` 10.6.0): infrastructure-as-code baseline for reproducible multi-stage deployment and drift visibility.
- AWS Lambda (`nodejs24.x`, fallback `nodejs22.x`): production runtime for websocket/auth/messaging handlers aligned with current AWS support.
- GitHub Actions OIDC -> AWS IAM role assumption: CI/CD authentication without long-lived cloud keys; enforce trust policy subject conditions.
- CloudWatch + X-Ray + alarms: runtime observability and promotion gating for latency/error/replay/fanout behavior.
- SSM Parameter Store + KMS: stage-safe configuration and encrypted secret/material handling.
- Powertools (`logger`, `metrics`, `tracer`): standardized structured logs, custom metrics, and traces across handlers.
- `cdk-nag`, IAM Access Analyzer, `cdk diff`: IaC and IAM security controls integrated into CI.
- Artillery WebSocket tests: realistic burst/reconnect validation against deployed AWS endpoints.

Critical version note: keep AWS SDK v3 clients (`@aws-sdk/client-ssm`, `@aws-sdk/client-kms`) aligned on same minor stream (researched at 3.1022.0).

### Expected Features

v1.1 table stakes focus on production launch safety and runtime correctness rather than net-new user capabilities. The backlog should treat deploy determinism, progressive rollout, observability, security hardening, and live validation as first-class feature work.

**Must have (table stakes):**
- Repeatable staging/prod deployment pipeline with rollback path.
- Progressive Lambda rollout (canary/linear) with alarm-driven rollback.
- WebSocket + Lambda observability baseline (metrics, logs, alarms, correlation IDs).
- Live AWS validation suite for auth context, fanout/replay, trust-change, and attachment flows.
- IAM least-privilege hardening and temporary-credential model.
- Secrets handling and production-safe defaults.
- Load/concurrency guardrails to protect downstream dependencies under burst.

**Should have (competitive):**
- Protocol-level synthetic canaries for continuous runtime drift detection.
- Release health scorecards as deployment gates.
- Replay/fanout diagnostics dashboards.
- Automated IAM/resource policy drift detection with remediation queue.

**Defer (v2+):**
- Chaos/fault-injection resilience programs.
- Automated traffic reshaping by anomaly class.
- Multi-region failover validation playbooks.

### Architecture Approach

Architecture guidance is to preserve the v1.0 serverless shape and harden integration seams for live operation. Keep route-oriented transport adapters, stateless crypto boundary, and durability-first write-then-deliver flow. For v1.1, introduce environment-isolated stacks, deployment workflow, runtime verification harness, and stronger telemetry around relay outcomes and auth context propagation.

**Major components:**
1. Cognito + Auth/Connection handlers: validate JWT claim context, bind and clean connection identity mappings.
2. Message ingest + delivery services: persist encrypted envelopes first, then fan out via `@connections` with bounded retries and offline fallback.
3. DynamoDB state layer (+ streams): manage identities, keys, messages, and connection index with idempotent and conditional write invariants.
4. Observability + verification plane: CloudWatch/X-Ray dashboards, alarms, and black-box runtime validation as promotion gates.

### Critical Pitfalls

1. **Environment drift from console-first changes** - Avoid with CDK-only deployments, immutable artifact promotion, and CI drift checks.
2. **Overbroad IAM and weak JWT claim validation** - Avoid with per-function least privilege, Access Analyzer gating, centralized verifier, and strict per-route claim matrix.
3. **Stale websocket connection retry storms** - Avoid by treating 410/Gone as terminal invalidation, evicting stale connection mappings, and replaying offline.
4. **Assuming exactly-once processing** - Avoid with end-to-end idempotency keys, conditional writes, duplicate-event tests, and retry-safe workflows.
5. **TTL/consistency and telemetry leakage mistakes** - Avoid by read-time expiry enforcement, strong reads where correctness-critical, and allowlist-based redacted logs.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Deployment Foundation and Stage Isolation
**Rationale:** Every later validation and hardening activity depends on deterministic, environment-separated infrastructure.
**Delivers:** CDK-defined stacks (`dev`/`staging`/`prod`), immutable artifact path, baseline CI deploy workflow, `cdk diff` review gate.
**Addresses:** repeatable infra deployment, environment parity, rollback readiness.
**Avoids:** deployment drift and unreproducible prod-only failures.

### Phase 2: Security Hardening and Identity Guardrails
**Rationale:** Live launch is blocked if auth or IAM controls are weak, even when functional tests pass.
**Delivers:** least-privilege IAM roles, OIDC trust restrictions, JWT claim-matrix verification hardening, secrets/config policy, redaction enforcement.
**Uses:** IAM Access Analyzer, Parameter Store/KMS, Powertools structured logging.
**Avoids:** wildcard-permission blast radius, context-confused token acceptance, metadata leakage.

### Phase 3: Realtime Reliability and Concurrency Controls
**Rationale:** Fanout/replay behavior under churn is the highest runtime risk area for this backend class.
**Delivers:** stale-connection invalidation logic, bounded retry/offline fallback behavior, reserved concurrency strategy, relay outcome metrics.
**Implements:** write-then-deliver durability pattern with operational backpressure.
**Avoids:** 410/Gone retry storms, downstream throttling cascades, silent delivery regressions.

### Phase 4: Data Correctness and Idempotency
**Rationale:** At-least-once serverless semantics require explicit correctness controls before production promotion.
**Delivers:** operation idempotency keys, conditional-write invariants, TTL-safe read guards, duplicate-event test suite.
**Addresses:** duplicate fanout/persistence side effects, stale-record policy bypass, replay correctness drift.
**Avoids:** message duplication, ghost session/device state, intermittent correctness bugs.

### Phase 5: Runtime Validation Gates and Progressive Promotion
**Rationale:** v1.1 success criteria require proof in live AWS, not just deploy success.
**Delivers:** automated black-box validation suite for auth context, fanout/replay, trust-change, attachments; canary/linear rollout; release-blocking alarm gates.
**Uses:** Artillery + CloudWatch metrics/alarms + deployment gating.
**Avoids:** user-discovered regressions after nominally successful deploys.

### Phase 6: Operations Readiness and Incident Drills
**Rationale:** Compromise and recovery workflows are recurring production realities, not optional post-launch work.
**Delivers:** runbooks and rehearsals for revoke/rekey/trust-change, owner mapping, SLO-backed incident workflow.
**Addresses:** security operations continuity and recovery confidence.
**Avoids:** prolonged compromise impact and inconsistent emergency response.

### Phase Ordering Rationale

- Infrastructure determinism first: validation without environment stability produces noisy and non-actionable failures.
- Security before scale validation: auth/IAM/logging controls are launch blockers and reduce risk during load testing.
- Realtime reliability before promotion: fanout/replay correctness and connection lifecycle handling are primary user-trust vectors.
- Idempotency and lifecycle correctness before gate enforcement: promotion gates are meaningful only when system semantics are stable under retries/staleness.
- Incident readiness last but mandatory: once production promotion begins, operational response capability must already be rehearsed.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3:** websocket churn behavior, callback failure handling patterns, and concurrency budgets under realistic reconnect storms.
- **Phase 4:** idempotency key design and conditional-write schema details for existing DynamoDB model.
- **Phase 6:** practical revoke/rekey/trust-change drill design and measurable SLO definitions.

Phases with standard patterns (skip research-phase):
- **Phase 1:** CDK-based stage isolation and CI deploy workflow are mature, well-documented patterns.
- **Phase 2:** IAM least-privilege + OIDC federation + centralized JWT claim validation are standard AWS security baselines.
- **Phase 5:** canary/linear rollout and alarm-gated promotion via AWS-native tooling are established patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Strongly grounded in official AWS/GitHub docs and concrete version pinning in STACK research. |
| Features | HIGH | Clear table-stakes vs differentiators with direct mapping to v1.1 acceptance goals. |
| Architecture | MEDIUM-HIGH | High alignment with existing platform; some implementation specifics still depend on current repo wiring and deploy topology. |
| Pitfalls | MEDIUM | Risk themes are strong, but PITFALLS file includes two merged research blocks (2026-04-02 and 2026-03-19), requiring synthesis and deduplication assumptions. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- Existing PITFALLS content is duplicated/merged from two contexts; normalize into one canonical pitfall register before phase planning to avoid conflicting controls.
- Concrete AWS account topology (single-account vs multi-account promotion path) is not finalized in research and should be fixed during Phase 1 planning.
- Exact alarm thresholds/SLO budgets for rollout gating are not numerically specified; define target values before production promotion.
- Current test harness coverage for trust-change and attachment envelope runtime checks should be baseline-audited before building new validation gates.

## Sources

### Primary (HIGH confidence)
- AWS Lambda runtimes, best practices, concurrency, and metrics docs - runtime baseline and operational controls.
- AWS API Gateway WebSocket docs (`$connect`, `$disconnect`, routes, `@connections`) - transport behavior and callback lifecycle.
- AWS DynamoDB docs (TTL and read consistency) - lifecycle and correctness constraints.
- AWS IAM best practices + Access Analyzer docs - least privilege and policy validation.
- Amazon Cognito JWT verification docs - signature + claims + key rotation requirements.
- GitHub Actions OIDC in AWS docs - short-lived CI/CD credential model.

### Secondary (MEDIUM confidence)
- Signal protocol specifications (X3DH, Double Ratchet) referenced in PITFALLS append for protocol-abuse and state-race considerations.
- npm package metadata snapshots (2026-04-02) for stack version recommendations.

### Tertiary (LOW confidence)
- None identified as standalone decision drivers; low-confidence inferences were excluded from roadmap implications.

---
*Research completed: 2026-04-02*
*Ready for roadmap: yes*# Project Research Summary

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
