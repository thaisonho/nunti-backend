# Roadmap: AWS E2EE Messaging Backend

## Milestones

- [x] **v1.0: AWS E2EE Messaging Backend** - Shipped 2026-04-02. Full phase archive: `.planning/milestones/v1.0-ROADMAP.md`.
- [ ] **v1.1: Live AWS Launch** - In planning. Phases 6-11.

## Overview

v1.1 focuses on launching the existing backend into live AWS with deterministic deployment, production hardening, runtime correctness controls, and operational readiness gates. Phase structure is derived from v1.1 requirement categories and ordered by dependency from deployment foundation through release validation and incident operations.

## Phases

**Phase Numbering:**
- Integer phases (6, 7, 8): Planned milestone work
- Decimal phases (6.1, 6.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 6: Deployment Foundation and Promotion Path** - Establish repeatable AWS deployment with immutable promotion and rollback.
- [ ] **Phase 7: Security Hardening for Live Runtime** - Enforce least privilege and production-safe auth/secret defaults.
- [ ] **Phase 8: Realtime Reliability Controls** - Prevent stale-connection and burst-failure cascades in live traffic.
- [ ] **Phase 9: Data Correctness Under Retry Semantics** - Guarantee idempotent and consistency-safe messaging state behavior.
- [ ] **Phase 10: Live AWS Runtime Validation Gates** - Prove auth/fanout/replay/trust/attachment behavior before promotion.
- [ ] **Phase 11: Operations Readiness and Incident Response** - Ensure live incident handling is actionable and SLO-aligned.

## Phase Details

### Phase 6: Deployment Foundation and Promotion Path
**Goal**: Team can deploy and promote backend releases across staging and production using deterministic workflows and rollback-safe artifacts.
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: DEP-01, DEP-02
**Success Criteria** (what must be TRUE):
	1. Team can deploy a tagged backend release to staging and production via the same versioned workflow without manual console edits.
	2. Team can promote the same immutable artifact from staging to production with verifiable provenance.
	3. Team can execute an explicit rollback to the previous known-good artifact when a release gate fails.
**Plans**: 2 plans

Plans:
- [ ] 06-01-PLAN.md - Deterministic staging deployment foundation via SAM, manifest contract, and release-tag automation.
- [ ] 06-02-PLAN.md - Immutable production promotion and explicit rollback workflow with operator runbook.

### Phase 7: Security Hardening for Live Runtime
**Goal**: Live runtime enforces least-privilege access and production-safe auth/secret protections by default.
**Depends on**: Phase 6
**Requirements**: SEC-01, SEC-02
**Success Criteria** (what must be TRUE):
	1. Runtime and deployment roles operate with least-privilege permissions and deny overbroad access paths.
	2. JWT validation rejects tokens that violate issuer, audience, claim, or context rules required by each protected route.
	3. Secrets and sensitive metadata are managed through approved secret stores, and logs default to redacted metadata output.
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md - Least-privilege deployment and runtime IAM boundaries with environment-specific OIDC roles.
- [ ] 07-02-PLAN.md - Production-safe auth, secret resolution, and realtime log redaction.

### Phase 8: Realtime Reliability Controls
**Goal**: Realtime delivery remains stable under stale connections and burst traffic without retry amplification.
**Depends on**: Phase 7
**Requirements**: REL-01, REL-02
**Success Criteria** (what must be TRUE):
	1. Stale WebSocket connections are terminally invalidated and no longer trigger repeated delivery storms.
	2. Offline recipients receive replay fallback instead of indefinite realtime retry loops.
	3. Burst traffic is handled with bounded retry and concurrency controls that prevent persistent relay failure cascades.
**Plans**: TBD

### Phase 9: Data Correctness Under Retry Semantics
**Goal**: Messaging and fanout state remains correct under retries, at-least-once processing, and consistency-sensitive reads.
**Depends on**: Phase 8
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
	1. Duplicate ingest or fanout attempts do not create duplicated persisted message state.
	2. Replay and trust-related reads honor expiry and consistency rules, preventing stale or invalid state from being served.
	3. Retry-driven write paths preserve correctness invariants through idempotent and conditional persistence behavior.
**Plans**: TBD

### Phase 10: Live AWS Runtime Validation Gates
**Goal**: Release promotion is gated by successful live AWS validation of critical realtime and envelope flows.
**Depends on**: Phase 9
**Requirements**: VAL-01, VAL-02
**Success Criteria** (what must be TRUE):
	1. Team can run live AWS end-to-end tests that verify auth context propagation across WebSocket message routes.
	2. Team can run live validation for fanout/replay, trust-change propagation, and attachment envelope transport.
	3. Production promotion is blocked when required live validation gates fail.
**Plans**: TBD

### Phase 11: Operations Readiness and Incident Response
**Goal**: On-call and release operators can detect, triage, and respond to key encrypted messaging incidents in live AWS.
**Depends on**: Phase 10
**Requirements**: OPS-01, OPS-02
**Success Criteria** (what must be TRUE):
	1. Team can follow runbooks to execute revoke, rekey, trust-change, and replay anomaly response paths during incidents.
	2. SLO-aligned alerts and health signals identify live regressions early enough to support safe promotion decisions.
	3. Incident triage for key live flows is actionable without ad-hoc undocumented recovery steps.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 6 -> 6.1 -> 6.2 -> 7 -> 7.1 -> 8 -> ...

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Deployment Foundation and Promotion Path | 0/0 | Not started | - |
| 7. Security Hardening for Live Runtime | 0/2 | Not started | - |
| 8. Realtime Reliability Controls | 0/0 | Not started | - |
| 9. Data Correctness Under Retry Semantics | 0/0 | Not started | - |
| 10. Live AWS Runtime Validation Gates | 0/0 | Not started | - |
| 11. Operations Readiness and Incident Response | 0/0 | Not started | - |
