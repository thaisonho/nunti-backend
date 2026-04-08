# Pitfalls Research

**Domain:** Live AWS launch for serverless realtime E2EE messaging backend
**Researched:** 2026-04-02
**Confidence:** MEDIUM-HIGH

## Critical Pitfalls

### Pitfall 1: Console-first deployment causes environment drift

**What goes wrong:**
Staging and production diverge (API routes, Lambda env vars, IAM policies, table settings), so runtime behavior is inconsistent and defects cannot be reproduced safely.

**Why it happens:**
Teams ship via console edits or ad hoc scripts during launch pressure.

**How to avoid:**
Use IaC as the single source of truth, enforce immutable artifact promotion, and block manual changes with drift detection in CI.

**Warning signs:**
- "Works in staging, broken in prod" without code differences.
- CloudFormation/CDK diff is non-empty after a "no-op" deploy.
- Environment variables differ across stages.

**Phase to address:**
Phase 1 - Deployment Foundation and Release Workflow.

---

### Pitfall 2: IAM wildcard permissions in launch templates

**What goes wrong:**
Compromised function credentials can access unrelated resources, increasing blast radius.

**Why it happens:**
Launches start with broad permissions (`*`) to move fast, then never get tightened.

**How to avoid:**
Enforce least-privilege IAM roles per Lambda, add IAM Access Analyzer policy validation in CI, and require explicit resource scoping and conditions.

**Warning signs:**
- Policies include `Action: *` or `Resource: *` for runtime roles.
- No automated policy lint/validation in the pipeline.
- Same role shared by many unrelated handlers.

**Phase to address:**
Phase 2 - Security Hardening and IAM Guardrails.

---

### Pitfall 3: JWT validation checks signature only

**What goes wrong:**
Validly signed but wrong-context tokens are accepted (wrong issuer/client/token_use/scope), allowing privilege misuse.

**Why it happens:**
Custom auth code verifies cryptographic signature but skips strict claim policy per route.

**How to avoid:**
Centralize token verification and enforce claim matrix per endpoint (`iss`, `exp`, audience/client, `token_use`, scopes), including JWKS rotation behavior.

**Warning signs:**
- ID and access tokens both accepted on protected APIs.
- Per-route auth checks differ in code.
- Key rotation events trigger auth outages.

**Phase to address:**
Phase 2 - Security Hardening and IAM Guardrails.

---

### Pitfall 4: WebSocket lifecycle mishandling (stale connectionId)

**What goes wrong:**
Backend repeatedly posts to dead connections, causing 410/Gone failures, retry storms, and missed realtime delivery.

**Why it happens:**
`$disconnect` cleanup is unreliable, and callback errors are not treated as hard invalidation.

**How to avoid:**
On callback failure/Gone, immediately evict connection registry entry; use freshness timestamps and fallback to offline replay path.

**Warning signs:**
- Rising `GoneException`/410 errors from `@connections` callback path.
- Users only receive messages after app reopen.
- High callback retry volume during reconnect bursts.

**Phase to address:**
Phase 3 - Realtime Runtime Validation on AWS.

---

### Pitfall 5: Assuming exactly-once event processing

**What goes wrong:**
Duplicate Lambda/event processing creates duplicated fanout, duplicate persistence, and inconsistent delivery state.

**Why it happens:**
At-least-once semantics are ignored; no idempotency key strategy across handlers.

**How to avoid:**
Make every write path idempotent with stable operation keys and conditional writes; test retries and batch partial-failure paths.

**Warning signs:**
- Same message ID appears multiple times in durable storage.
- Duplicate client notifications for one message.
- Retry storms after transient downstream errors.

**Phase to address:**
Phase 4 - Data Correctness and Idempotency.

---

### Pitfall 6: DynamoDB TTL/consistency assumptions in auth or delivery paths

**What goes wrong:**
Expired or stale records continue affecting authorization, session/device validity, or replay queues.

**Why it happens:**
Teams assume TTL deletes are immediate and all reads are current.

**How to avoid:**
Treat TTL as eventual cleanup only, enforce `expiresAt > now` checks in code, and use strong consistency where correctness is mandatory.

**Warning signs:**
- Expired records still appear in Query/Scan outputs.
- Ghost sessions/devices after revoke/rotate flows.
- Intermittent auth mismatch after successful writes.

**Phase to address:**
Phase 4 - Data Correctness and Idempotency.

---

### Pitfall 7: No explicit concurrency guardrails for Lambda + downstreams

**What goes wrong:**
Traffic spikes saturate DynamoDB or callback paths, causing throttles, timeouts, and cascading retries.

**Why it happens:**
Reserved concurrency and backpressure settings are not tuned per function criticality.

**How to avoid:**
Set reserved concurrency per workload class, isolate noisy functions, add queue-based smoothing where needed, and define throttle budgets.

**Warning signs:**
- Rising `Throttles`, `Errors`, and p95 duration during bursts.
- Downstream services fail during message fanout spikes.
- One hot function starves others.

**Phase to address:**
Phase 3 - Realtime Runtime Validation on AWS.

---

### Pitfall 8: Launching without runtime validation gates

**What goes wrong:**
Production incidents are discovered by users first because release criteria measure deployment success, not runtime correctness.

**Why it happens:**
No synthetic probes/UAT gates for reconnect replay, trust-change fanout, attachment flow, and websocket auth context.

**How to avoid:**
Add release-blocking AWS validation suite, canary scenarios, and CloudWatch alarm thresholds for key reliability/security SLOs.

**Warning signs:**
- Deploy succeeds but critical flows regress in prod.
- No alarm coverage for replay lag, callback failure, auth anomalies.
- UAT is manual and non-repeatable.

**Phase to address:**
Phase 5 - Runtime Validation Gates and Observability.

---

### Pitfall 9: Sensitive metadata leakage in logs/traces/DLQ

**What goes wrong:**
Ciphertext envelopes, device identifiers, or key metadata leak into telemetry stores, increasing breach impact.

**Why it happens:**
Default structured logging captures full payloads; failure pipelines retain raw bodies.

**How to avoid:**
Use allowlist-based logging, redaction tests in CI, encrypted payload storage for failure paths, and strict log retention.

**Warning signs:**
- Search queries find ciphertext or key-like fields in CloudWatch.
- DLQ payloads contain full message envelopes.
- Debug mode routinely enabled in production.

**Phase to address:**
Phase 2 - Security Hardening and IAM Guardrails.

---

### Pitfall 10: No tested incident runbook for compromise/revocation

**What goes wrong:**
During key compromise or stolen device events, responses are slow/inconsistent and stale devices remain in fanout.

**Why it happens:**
Teams implement revoke APIs but do not test end-to-end emergency workflows under production constraints.

**How to avoid:**
Create operational runbooks and drills for revoke, rekey, trust-change fanout, and post-incident verification.

**Warning signs:**
- "Device stolen" scenario has no timed drill history.
- Revoked devices still receive messages in validation runs.
- No owner/on-call mapping for security incidents.

**Phase to address:**
Phase 6 - Security Operations and Incident Response.

## Technical Debt Patterns

Shortcuts that feel fast in launch week but create long-term instability.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Manual console edits in prod | Quick hotfix | Irreproducible environments and hidden drift | Never for milestone launch |
| Shared broad IAM execution role | Faster initial setup | High blast radius and audit pain | Never |
| No idempotency keys | Less code now | Duplicate messages and state corruption | Never |
| TTL-only expiry enforcement | Simple data lifecycle | Expired state still influences logic | Never |
| Raw payload logging for debugging | Faster diagnosis | Sensitive metadata exposure | Only local synthetic fixtures |

## Integration Gotchas

Common mistakes when integrating live AWS services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| API Gateway WebSocket callbacks | Retrying stale `connectionId` indefinitely | Treat 410/Gone as terminal, evict registry entry, replay offline |
| Lambda event sources | Assuming exactly-once processing | Implement idempotent handlers and conditional writes |
| DynamoDB TTL | Assuming immediate deletion | Apply read-time expiry filters and safe conditions |
| Cognito JWT verification | Signature-only checks | Validate claims and token context per endpoint |
| IAM policy management | Hand-written broad policies shipped to prod | Validate with analyzer and tighten to least privilege |

## Performance Traps

Patterns that pass in test but fail under live traffic.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded fanout retries | Cost spike, growing backlog | Capped retries, dead-letter strategy, backpressure | Reconnect storms |
| Missing reserved concurrency strategy | Cross-function starvation | Per-function reserved concurrency and isolation | Traffic spikes |
| Large monolithic batch processing | Timeouts and duplicate retries | Smaller idempotent units with partial-failure handling | Medium-high message throughput |
| No hot-key strategy in DynamoDB | Throttles and p95 spikes | Access-pattern review, partition-aware keys, smoothing | Group chats with uneven traffic |

## Security Mistakes

Domain-specific mistakes for live serverless messaging operation.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Overbroad Lambda IAM roles | Lateral access after credential compromise | Least-privilege roles with conditions and analyzer checks |
| Incomplete JWT claim validation | Unauthorized route access | Central verifier + endpoint claim matrix |
| Logging cryptographic metadata | Data exposure beyond message content | Redaction, schema allowlists, retention controls |
| Long-lived static credentials in CI or ops | Credential leakage and persistence | Temporary credentials, role assumption, key rotation |
| Missing MFA/guardrails for privileged access | Administrative account takeover risk | MFA, restricted break-glass, access reviews |

## UX Pitfalls

Operational issues that users experience as product trust failures.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Realtime messages silently dropped during reconnect | Users think messages are lost | Reliable offline replay and explicit delivery status |
| Trust/device changes not reflected quickly | Confusing security posture | Fast trust-change propagation with clear client events |
| Incident recovery unclear | Users abandon after compromise | Clear revoke/recover flow backed by tested runbook |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical launch controls.

- [ ] **Deployment:** IaC deploy passes in all stages, with automated drift detection and rollback rehearsal.
- [ ] **Auth:** Negative-token suite rejects wrong issuer/client/token type/scope.
- [ ] **Realtime:** Forced stale-connection test confirms 410/Gone invalidation and offline fallback.
- [ ] **Idempotency:** Retry/duplicate event tests produce exactly one durable effect per operation key.
- [ ] **Data lifecycle:** Expired records never influence auth/session/delivery decisions.
- [ ] **Observability:** Release gate requires healthy alarms on errors, throttles, callback failures, and replay lag.
- [ ] **Security:** Policy validation and log-redaction checks run in CI.
- [ ] **Operations:** Compromise drill (revoke/rekey/trust-change) meets SLO.

## Recovery Strategies

When prevention fails, how to recover quickly.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Deployment drift incident | MEDIUM | Freeze console changes, re-apply IaC baseline, verify config parity, re-run validation suite |
| Overbroad IAM discovered in prod | HIGH | Reduce policies immediately, rotate credentials, audit access logs, enforce analyzer gates |
| Stale connection retry storm | MEDIUM | Trip circuit breaker, purge stale registry entries, route to replay queue, ramp callbacks gradually |
| Idempotency defect causing duplicates | HIGH | Enable dedupe guard, reconcile duplicate records, replay from trusted checkpoint |
| Metadata leak in telemetry | HIGH | Purge/expire affected logs where possible, rotate affected secrets, deploy redaction fix, perform post-incident audit |

## Pitfall-to-Phase Mapping

How v1.1 phases should prevent these issues.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Console drift / non-repeatable deploys | Phase 1 | Drift check is empty after deploy; rollback drill succeeds |
| IAM wildcard permissions | Phase 2 | CI policy validation passes with no high-severity findings |
| JWT context validation gaps | Phase 2 | Negative auth suite blocks wrong claims/token_use/client |
| Stale WebSocket connection handling | Phase 3 | 410/Gone test triggers eviction + successful replay fallback |
| Duplicate event side effects | Phase 4 | Duplicate-event tests produce single durable effect |
| TTL/consistency misuse | Phase 4 | Expired/stale state tests cannot bypass policy or replay correctness |
| Concurrency/throttle cascades | Phase 3 | Load test stays within SLO and alarm budgets |
| Missing runtime validation gates | Phase 5 | Release blocked unless synthetic AWS validation suite passes |
| Telemetry metadata leakage | Phase 2 | Automated log scans find zero disallowed fields |
| Untested compromise response | Phase 6 | Incident drill completes revoke/rekey/trust-change within SLO |

## Sources

- AWS Lambda best practices (idempotency, duplicate processing, throttle controls): https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- AWS Lambda reserved concurrency (limit scaling, protect downstream systems): https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html
- AWS Lambda metrics (Errors, Throttles, Duration, concurrency, dropped async events): https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html
- API Gateway WebSocket lifecycle (`$connect`, `$disconnect`, `@connections` usage): https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html
- API Gateway WebSocket backend callbacks and GoneException behavior: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html
- DynamoDB TTL behavior (eventual deletion, read-time filtering guidance): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html
- DynamoDB read consistency model: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html
- IAM security best practices (temporary credentials, MFA, least privilege, Access Analyzer): https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
- Cognito JWT verification guidance (signature + claim validation): https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html

---
*Pitfalls research for: v1.1 Live AWS Launch (existing serverless E2EE backend)*
*Researched: 2026-04-02*# Pitfalls Research

**Domain:** AWS-based Signal-protocol E2EE messaging backend (serverless)
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH

## Critical Pitfalls

### Pitfall 1: One-time prekey reuse or non-atomic consumption

**What goes wrong:**
Two senders can receive the same one-time prekey (or no one-time prekey fallback happens too often), reducing initial forward secrecy and causing hard-to-debug bootstrap failures.

**Why it happens:**
Prekey bundle fetch/dequeue is implemented as separate read/write operations without conditional atomicity; preload jobs for OPK refill are missing.

**How to avoid:**
Use an atomic consume pattern in DynamoDB: `TransactWriteItems` or conditional delete/update on OPK records with strict uniqueness, plus low-watermark alarms and automatic OPK replenishment. Rate-limit prekey-bundle fetches per requester to reduce draining abuse.

**Warning signs:**
- Sudden increase in sessions established without OPK.
- Duplicate OPK IDs observed in successful session-init telemetry.
- Frequent bootstrap retries even when recipients are online.

**Phase to address:**
Phase 3 - Session Bootstrap and Prekey Service hardening.

---

### Pitfall 2: X3DH replay accepted without rapid key randomization

**What goes wrong:**
Replayed initial messages can lead to SK reuse patterns and protocol confusion, especially if post-X3DH ratcheting is delayed.

**Why it happens:**
Teams treat X3DH initial handshake as sufficient and do not enforce immediate Double Ratchet progression and replay controls.

**How to avoid:**
Require immediate post-bootstrap ratchet step before accepting high-value traffic, track replay fingerprints for initial envelopes, and enforce short replay windows with nonce/initial-message dedup.

**Warning signs:**
- Same initial message fingerprint accepted multiple times.
- Identical early-session metadata across distinct session IDs.
- Inconsistent first-message decrypt state across devices.

**Phase to address:**
Phase 1 - Threat Model and Crypto Contract.

---

### Pitfall 3: Ratchet state races across devices/Lambda concurrency

**What goes wrong:**
Out-of-order updates corrupt `Ns/Nr/PN/MKSKIPPED` progression, causing permanent decrypt failures or false "bad message" outcomes.

**Why it happens:**
Serverless handlers process concurrent events for the same conversation/device without per-session serialization or optimistic locking.

**How to avoid:**
Use deterministic per-conversation ordering (SQS FIFO key or equivalent), versioned state records with conditional writes, and conflict-retry logic that never commits partially advanced ratchet state.

**Warning signs:**
- Burst of decryption failures after reconnect storms.
- Repeated conditional-write conflicts on ratchet state items.
- Support reports of one device failing while another device works.

**Phase to address:**
Phase 4 - Messaging Pipeline Reliability and Ordering.

---

### Pitfall 4: Assuming exactly-once processing in Lambda/event mappings

**What goes wrong:**
Duplicate delivery, duplicate fanout, and duplicate ack updates create double-send behavior and state divergence.

**Why it happens:**
Lambda integrations are treated as exactly-once; idempotency keys are missing at message-ingest and delivery worker layers.

**How to avoid:**
Design every write path as idempotent using operation keys (message UUID + recipient device + stage), conditional writes for first-commit wins, and safe retry/backoff policies.

**Warning signs:**
- Same message UUID appears multiple times in delivery logs.
- Delivery counters > expected recipient-device count.
- Duplicate user-visible notifications for same ciphertext.

**Phase to address:**
Phase 4 - Messaging Pipeline Reliability and Ordering.

---

### Pitfall 5: Treating API Gateway WebSocket connection IDs as stable truth

**What goes wrong:**
Backend keeps posting to stale `connectionId`s, causing callback failures, dropped realtime notifications, and retry storms.

**Why it happens:**
Connection registry cleanup is delayed; `$disconnect` handling and `@connections` status checks are incomplete; 410/Gone behavior is not folded into retry logic.

**How to avoid:**
Maintain short-lived connection registry with heartbeat/update timestamp, handle `$disconnect` and failed callback as hard invalidation signals, and gate sends by recent connection freshness plus fallback to queued offline delivery.

**Warning signs:**
- Rising callback failure rate from management API posts.
- High ratio of reconnects to successful push callbacks.
- "Realtime not received until app reopen" user reports.

**Phase to address:**
Phase 4 - Realtime Transport and Connection Lifecycle.

---

### Pitfall 6: Misusing DynamoDB consistency and TTL semantics

**What goes wrong:**
Stale reads reintroduce old device/session state, and expired items remain query-visible longer than expected, producing ghost sessions and phantom undelivered messages.

**Why it happens:**
Design assumes immediate deletion and globally fresh reads; TTL is treated as strict deadline instead of eventual background cleanup.

**How to avoid:**
Use strongly consistent reads for critical session/device transitions, add application-side expiry checks (`expiresAt > now`) on read paths, and treat TTL as storage cleanup only.

**Warning signs:**
- Expired records still returned in queries.
- Session conflicts right after key/device rotation.
- Intermittent stale state after successful writes.

**Phase to address:**
Phase 5 - Storage Correctness and Data Lifecycle.

---

### Pitfall 7: Token verification that checks signature only (or wrong claims)

**What goes wrong:**
Requests with validly signed but wrong-context tokens (wrong pool/client/scope/use) get accepted, enabling privilege misuse.

**Why it happens:**
JWT verification is implemented ad hoc and omits claim checks (`iss`, `exp`, `token_use`, audience/client context) and JWKS `kid` rotation handling.

**How to avoid:**
Centralize verification with strict policy (recommended verifier libraries), enforce claim matrix per endpoint, cache JWKS by `kid` with refresh-on-miss behavior, and test rotated-key scenarios.

**Warning signs:**
- APIs accept both ID and access tokens interchangeably.
- Token validation code differs by endpoint/team module.
- Errors spike when Cognito rotates signing keys.

**Phase to address:**
Phase 2 - Identity/AuthN/AuthZ Baseline.

---

### Pitfall 8: Sensitive cryptographic metadata leaking into logs and dead-letter stores

**What goes wrong:**
Ciphertext envelopes, key identifiers, or ratchet headers leak into CloudWatch logs, traces, and DLQs, expanding breach blast radius.

**Why it happens:**
Default structured logging captures raw event payloads; failure handlers push full payload to retries/DLQ.

**How to avoid:**
Adopt an explicit redaction schema, log allowlists (not denylists), encrypted DLQ payloads with minimal metadata, and CI checks banning dangerous log fields.

**Warning signs:**
- CloudWatch search returns ciphertext blobs or key-like fields.
- DLQ messages contain full message envelopes.
- Developers rely on raw payload logging to debug decrypt issues.

**Phase to address:**
Phase 1 - Security Baseline and Data Handling Policy.

---

### Pitfall 9: Unbounded skipped-key retention (MKSKIPPED) and replay window abuse

**What goes wrong:**
Attackers force excessive skipped-key storage and expensive catch-up computation, causing per-session DoS and memory/storage growth.

**Why it happens:**
`MAX_SKIP`, key-retention limits, and pruning policies are not enforced uniformly across devices and session versions.

**How to avoid:**
Set strict per-session bounds for skipped keys, deterministic pruning triggers, rate-limit pathological sender patterns, and mark sessions for re-establishment when limits are exceeded.

**Warning signs:**
- Rapid growth in skipped-key item count per active session.
- CPU spikes correlated with out-of-order message bursts.
- Frequent session resets during adversarial traffic tests.

**Phase to address:**
Phase 3 - Ratchet State Model and Abuse Controls.

---

### Pitfall 10: No operational playbook for key compromise and device revocation

**What goes wrong:**
Compromised devices continue receiving encrypted traffic; users cannot safely recover trust after key theft/reinstall events.

**Why it happens:**
Roadmaps focus on happy-path cryptography and omit incident-response flows: revoke, rekey, notify contacts, and block stale-device fanout.

**How to avoid:**
Define compromise response APIs and UX events early: immediate device quarantine, forced session re-init, signed trust-change notifications, and auditable rekey completion checks.

**Warning signs:**
- No tested runbook for "device stolen" scenario.
- Stale device IDs remain in recipient fanout lists after revocation.
- Contacts are not warned when identity keys change.

**Phase to address:**
Phase 6 - Security Operations and Recovery Workflows.

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store ratchet/session state in a single unversioned document per chat | Faster first implementation | Race conditions and silent state corruption under concurrency | Never for multi-device async messaging |
| Trust TTL alone for expiry correctness | Less code on read paths | Ghost records and policy violations | Never for security-sensitive state |
| Log full inbound envelopes for debugging | Quick troubleshooting | Persistent sensitive metadata exposure | Only in local isolated test fixtures with synthetic data |
| Skip OPK low-watermark automation | Fewer background jobs | Degraded forward secrecy and bootstrap failures | Never beyond throwaway prototype |
| Per-route custom JWT checks | Flexible in short term | Authorization drift and inconsistent trust decisions | Never for production APIs |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| API Gateway WebSocket + backend callbacks | Posting to stale `connectionId` without freshness checks | Keep connection registry fresh, invalidate on callback failure/disconnect, and queue offline fallback |
| DynamoDB TTL | Treating TTL as immediate delete | Keep explicit app-level expiry checks and query filters; TTL is eventual cleanup |
| DynamoDB reads | Defaulting all reads to eventual consistency | Use strongly consistent reads for critical key/session transitions |
| Cognito JWT | Accepting token after only signature check | Validate `iss`, expiry, token type/use, client/audience, and scopes per endpoint |
| Lambda retries | Not designing idempotency keys and first-write-wins semantics | Make all write-side effects idempotent with dedupe keys and conditional writes |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Hot partition on conversation/device keys | Elevated p95 latency and throttling for active chats | Use balanced partition strategy and bounded fanout workers | ~few high-traffic groups or bursty class cohorts |
| WebSocket callback retry storms | Cost spikes and delayed delivery during reconnect events | Circuit-breaker on stale connections, capped retries, and offline queue fallback | During network churn or app reconnect waves |
| Oversized batch decrypt/fanout Lambdas | Timeouts, partial failures, duplicate retries | Smaller batches, partial-failure handling, idempotent per-record processing | As concurrent active devices rise |
| Unbounded skipped-key handling | CPU/memory spikes on out-of-order streams | Enforce `MAX_SKIP`, prune aggressively, and re-establish sessions on abuse | Under malicious or lossy-network traffic |

## Security Mistakes

Domain-specific security issues beyond generic web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting unsigned/unchecked prekey provenance | MITM and key-substitution risk | Verify signed prekeys and enforce identity binding checks |
| Weak JWT claim validation | Privilege escalation via context-confused tokens | Central verifier with strict claim policy and key-rotation handling |
| Leaking protocol metadata in observability tools | Expanded breach impact despite E2EE payload encryption | Redaction, allowlisted logs, encrypted minimal DLQs |
| Missing abuse controls on prekey/message endpoints | Enumeration, prekey draining, and spam amplification | Rate limits, quotas, anomaly detection, and challenge policies |
| Slow compromise response | Long attacker dwell time on compromised device identities | Immediate revoke/rekey workflows and trust-change fanout |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent key/device changes | Users can’t distinguish benign reinstall from active attack | Explicit trust-change events with actionable prompts |
| Realtime-only delivery assumption | Messages appear lost when clients disconnect | Offline queue + reliable sync on reconnect |
| Inconsistent multi-device ordering | "Different history" across user devices | Deterministic per-device delivery order + conflict-safe state updates |
| Hidden recovery path after compromise | Users abandon platform after account/device incident | Clear emergency revoke and re-establish flows |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Prekey Service:** Often missing atomic OPK consumption and refill alarms - verify duplicate OPK use is impossible under load tests.
- [ ] **Ratchet State Persistence:** Often missing optimistic locking/version checks - verify concurrent updates cannot commit inconsistent counters.
- [ ] **JWT Auth:** Often missing claim-level policy checks - verify endpoints reject wrong `token_use`, pool, client, and scope.
- [ ] **WebSocket Delivery:** Often missing stale-connection handling - verify callback failures trigger registry invalidation + offline fallback.
- [ ] **TTL/Data Lifecycle:** Often missing read-time expiry enforcement - verify expired records never affect authorization/session logic.
- [ ] **Incident Recovery:** Often missing tested compromise runbook - verify revoke/rekey flows complete within defined SLO.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| OPK reuse/drain event | HIGH | Freeze bundle issuance for affected identities, rotate signed prekey + OPK pool, invalidate recently bootstrapped sessions, force re-init |
| Ratchet-state corruption | HIGH | Snapshot diagnostics, quarantine affected sessions, force safe session reset handshake, replay undelivered queue idempotently |
| JWT verification gap discovered | HIGH | Patch centralized verifier, rotate API credentials where needed, invalidate active sessions, audit logs for unauthorized acceptance window |
| Stale connection retry storm | MEDIUM | Trip retry circuit breaker, purge stale connection registry entries, shift to offline queue, gradually restore realtime callbacks |
| Metadata leak in logs/DLQ | HIGH | Rotate secrets/keys per incident policy, purge/expire exposed log stores, deploy redaction fix, run post-incident verification queries |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| One-time prekey reuse | Phase 3 | Load test proves unique OPK consumption; low-watermark alarm fires in simulation |
| X3DH replay/key-randomization gap | Phase 1 | Replay test corpus rejected or safely re-ratcheted with no key reuse indicators |
| Ratchet state races | Phase 4 | Concurrency tests show no divergent ratchet counters across repeated runs |
| Non-idempotent Lambda side effects | Phase 4 | Duplicate-event test yields single durable write per idempotency key |
| Stale WebSocket connection handling | Phase 4 | Forced reconnect test shows no retry storm and successful offline fallback |
| DynamoDB consistency/TTL misuse | Phase 5 | Expired or stale records cannot pass authorization/session checks in integration tests |
| JWT claim-validation gaps | Phase 2 | Negative-token suite blocks wrong issuer/client/use/scope and rotated-key scenarios |
| Metadata leakage | Phase 1 | Automated log-scan policy finds zero disallowed fields in CI and staging |
| Unbounded skipped-key retention | Phase 3 | Stress test caps skipped-key growth and triggers controlled session reset |
| Missing compromise recovery | Phase 6 | Tabletop + automated runbook exercise completes revoke/rekey within SLO |

## Sources

- Signal X3DH specification (replay, OPK handling, server trust): https://signal.org/docs/specifications/x3dh/
- Signal Double Ratchet specification Rev 4 (out-of-order handling, MAX_SKIP, key deletion): https://signal.org/docs/specifications/doubleratchet/
- AWS Lambda best practices (idempotency, retries, duplicate processing): https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- Amazon API Gateway WebSocket `@connections` usage and connection management: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html
- API Gateway WebSocket route/lifecycle concepts (`$connect`, `$disconnect`, `$default`): https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-overview.html
- DynamoDB TTL behavior (typically within a few days; filter expired items on reads): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html
- DynamoDB read consistency model (eventual vs strong): https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html
- Cognito JWT verification (signature + claims + JWKS/kid rotation): https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html

---
*Pitfalls research for: AWS-based Signal-protocol E2EE messaging backend*
*Researched: 2026-03-19*
