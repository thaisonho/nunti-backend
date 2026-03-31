# Roadmap: AWS E2EE Messaging Backend

## Overview

This roadmap delivers the backend in dependency order from team governance and secure identity, through Signal key lifecycle and reliable 1:1 encrypted transport, then into group, multi-device, and attachment capabilities. Each phase maps directly to a coherent v1 requirement cluster so progress can be validated with observable behaviors.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Collaboration Governance Baseline** - Team collaboration workflow is enforceable and auditable.
- [x] **Phase 2: Identity and Device Access** - Users authenticate through Cognito and manage trusted devices.
- [ ] **Phase 3: Signal Key Lifecycle and Bootstrap** - Devices exchange bootstrap key material safely for async session starts.
- [ ] **Phase 4: Reliable 1:1 Messaging Core** - Encrypted direct messaging works with delivery reliability and reconnect recovery.
- [ ] **Phase 5: Groups, Fanout, and Attachments** - Group delivery, multi-device fanout, and encrypted attachment envelopes are operational.

## Phase Details

### Phase 1: Collaboration Governance Baseline
**Goal**: Team can deliver backend changes through a consistent, review-gated, and auditable git workflow.
**Depends on**: Nothing (first phase)
**Requirements**: GIT-01, GIT-02, GIT-03
**Success Criteria** (what must be TRUE):
  1. Contributors can create and complete feature, release, and hotfix work using the Git Flow branch model.
  2. Pull requests targeting integration branches cannot be merged without at least one peer approval.
  3. New commits follow Conventional Commits format and produce a consistently classifiable history.
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md - Implement enforceable governance controls via Conventional Commit checks and ruleset-as-code.
- [x] 01-02-PLAN.md - Codify Git Flow contributor workflow, PR template gates, and governance verification matrix.

### Phase 2: Identity and Device Access
**Goal**: Users can securely authenticate and control which of their devices are allowed to participate.
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. User can sign up and sign in with email and password via Cognito.
  2. Requests with invalid JWT claims are rejected on protected routes, while valid tokens are accepted.
  3. User can register multiple devices and revoke a device so it is no longer authorized.
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md - Establish Wave 0 runtime/test scaffold and implement Cognito auth plus centralized JWT rejection contract.
- [x] 02-02-PLAN.md - Implement trusted-device register/list/revoke lifecycle and protected-route participation enforcement.

### Phase 3: Signal Key Lifecycle and Bootstrap
**Goal**: Clients can publish and retrieve Signal bootstrap key material with safe one-time semantics.
**Depends on**: Phase 2
**Requirements**: KEYS-01, KEYS-02, KEYS-03, KEYS-04
**Success Criteria** (what must be TRUE):
  1. Device can upload identity key and signed prekey, and later retrieve current device key state.
  2. Initiating client can fetch a one-time prekey bundle that is consumed atomically and not re-issued.
  3. Client can obtain session bootstrap metadata required for asynchronous session initiation.
  4. Trust-change events are emitted to affected clients when key or device trust state changes.
**Plans**: 1 plan

Plans:
- [ ] 03-PLAN.md - Extend device key state, atomic prekey bootstrap, and minimal trust-change fanout.

### Phase 4: Reliable 1:1 Messaging Core
**Goal**: Users can exchange encrypted direct messages in real time with durable retry-safe delivery behavior.
**Depends on**: Phase 3
**Requirements**: MSG-01, MSG-02, MSG-03
**Success Criteria** (what must be TRUE):
  1. User can send and receive 1:1 encrypted messages through the WebSocket relay.
  2. Delivery acknowledgement and idempotent retry behavior prevent duplicate message side effects.
  3. User who reconnects receives queued encrypted messages that were missed while offline.
**Plans**: TBD

### Phase 5: Groups, Fanout, and Attachments
**Goal**: Encrypted messaging scales to groups and multiple devices, including attachment envelope transport.
**Depends on**: Phase 4
**Requirements**: GRP-01, GRP-02, GRP-03, GRP-04
**Success Criteria** (what must be TRUE):
  1. Group members receive membership events (join, leave, update) relevant to their groups.
  2. User can send and receive encrypted group messages.
  3. Encrypted messages are fanned out across a user's active devices.
  4. User can send and receive encrypted attachment envelopes through backend transport workflows.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Collaboration Governance Baseline | 2/2 | Complete | 2026-03-19 |
| 2. Identity and Device Access | 2/2 | Complete | 2026-03-19 |
| 3. Signal Key Lifecycle and Bootstrap | 0/TBD | Not started | - |
| 4. Reliable 1:1 Messaging Core | 0/TBD | Not started | - |
| 5. Groups, Fanout, and Attachments | 0/TBD | Not started | - |
