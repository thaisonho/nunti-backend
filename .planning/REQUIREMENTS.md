# Requirements: AWS E2EE Messaging Backend

**Defined:** 2026-03-19
**Core Value:** Enable users to exchange and synchronize messages and related metadata reliably while preserving end-to-end confidentiality and protocol correctness.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can sign up and sign in with email and password via Cognito.
- [x] **AUTH-02**: Backend validates JWT claims (issuer, audience, token_use, expiry) on protected routes.
- [x] **AUTH-03**: User can register multiple devices and revoke a device.

### Key Management

- [ ] **KEYS-01**: Device can upload identity key and signed prekey for session bootstrap.
- [ ] **KEYS-02**: Backend provides one-time prekey bundles with atomic consume semantics.
- [ ] **KEYS-03**: Backend exposes session bootstrap metadata APIs for asynchronous initiation.
- [ ] **KEYS-04**: Backend emits trust-change events when key or device state changes.

### Messaging Core

- [x] **MSG-01**: User can send and receive 1:1 encrypted messages through WebSocket relay.
- [x] **MSG-02**: Backend supports delivery acknowledgement and idempotent retry behavior.
- [x] **MSG-03**: User receives queued encrypted messages after reconnect.

### Groups and Devices

- [x] **GRP-01**: Backend routes group membership events (join, leave, update) to relevant members.
- [x] **GRP-02**: User can send and receive encrypted group messages.
- [x] **GRP-03**: Backend fans out message delivery across user active devices.
- [x] **GRP-04**: Backend supports encrypted attachment envelope transport.

### Collaboration and Governance

- [x] **GIT-01**: Team uses Git Flow branching model for feature, release, and hotfix workflows.
- [x] **GIT-02**: Merges to integration branches require at least one peer pull request approval.
- [x] **GIT-03**: Commits follow Conventional Commits format for consistent change history.

## v2 Requirements

### Security and Protocol Evolution

- **SEC-01**: Backend supports post-quantum hybrid key exchange path.
- **SEC-02**: Backend enforces advanced group admin rekey policies.
- **SEC-03**: Backend supports disappearing message timer policy enforcement.

### Product Enhancements

- **PROD-01**: Backend supports message editing and deletion event workflows.
- **PROD-02**: Backend supports SSO federation providers beyond baseline Cognito auth.

## Out of Scope

Explicitly excluded for this project cycle.

| Feature | Reason |
|---------|--------|
| Server-side plaintext processing of message content | Violates end-to-end encryption trust boundary. |
| Enterprise-grade compliance certification delivery | Academic project scope does not target formal certification in v1. |
| Manual unreviewed code integration to mainline branches | Conflicts with team traceability and quality goals. |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | Complete |
| AUTH-02 | Phase 2 | Complete |
| AUTH-03 | Phase 2 | Complete |
| KEYS-01 | Phase 3 | Pending |
| KEYS-02 | Phase 3 | Pending |
| KEYS-03 | Phase 3 | Pending |
| KEYS-04 | Phase 3 | Pending |
| MSG-01 | Phase 4 | Complete |
| MSG-02 | Phase 4 | Complete |
| MSG-03 | Phase 4 | Complete |
| GRP-01 | Phase 5 | Complete |
| GRP-02 | Phase 5 | Complete |
| GRP-03 | Phase 5 | Complete |
| GRP-04 | Phase 5 | Complete |
| GIT-01 | Phase 1 | Complete |
| GIT-02 | Phase 1 | Complete |
| GIT-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after initial definition*
