# Feature Research

**Domain:** AWS-based end-to-end encrypted (E2EE) messaging backend
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Identity and device registration (auth + device binding) | Every mainstream messenger binds identity to one or more devices before encrypted messaging can work. | MEDIUM | Backend scope: Cognito auth, device records, signed device key registration, revocation. |
| Prekey bundle service and asynchronous session bootstrap (X3DH/PQXDH-ready) | Users expect they can message offline recipients and start chats instantly. | HIGH | Backend must store and atomically serve one-time prekeys, signed prekeys, and identity keys with anti-abuse rate limits. |
| Pairwise E2EE session lifecycle (Double Ratchet state transport support) | Core expectation: confidentiality, forward secrecy, post-compromise healing behavior. | HIGH | Server transports ciphertext/headers and stores minimal protocol state metadata; never plaintext keys/messages. |
| Reliable encrypted message delivery and ordering metadata | Users expect messages to arrive, retry, and appear in consistent order across reconnects. | HIGH | Backend needs message queueing, idempotency keys, ack/retry semantics, and out-of-order tolerance metadata. |
| Group messaging key distribution primitives | Group chat is table stakes in 2026 secure messengers. | HIGH | Backend coordinates sender key fanout / group state events / membership transitions without plaintext access. |
| Attachment envelope transport | Users expect encrypted media/docs, not text-only chat. | MEDIUM | Backend stores encrypted blobs and encrypted attachment pointers/keys separately from payload objects. |
| Multi-device message fanout and sync | Users expect phone + desktop/tablet consistency. | HIGH | Backend must track per-device queues, delivery state, device add/remove events, and stale device cutoff. |
| Key verification and trust-change signaling | Users expect ability to detect MITM risk when contacts rekey or reinstall. | MEDIUM | Backend carries safety-number identity data and emits trust-change events; verification UX is client-side. |
| Disappearing message timers and retention policy hooks | Ephemeral messaging is a standard privacy expectation. | MEDIUM | Backend stores timer metadata and enforces delete windows for queued ciphertext and delivery artifacts. |
| Abuse controls for encrypted systems | Users expect spam/scam blocking even in private apps. | HIGH | Backend supports rate limits, message requests, blocklists, unknown-sender throttles, and reporting envelopes (metadata only). |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Phone-number privacy with username-first discovery | Reduces social graph leakage and improves pseudonymous contact initiation. | HIGH | Backend needs private lookup, anti-enumeration controls, optional discoverability modes, and alias lifecycle APIs. |
| Sealed-sender style sender-metadata minimization | Better metadata privacy than basic E2EE transport. | HIGH | Requires tokenized delivery auth so relay can route messages without learning stable sender identity in normal flow. |
| E2EE backup key escrow design (opt-in, user-held secret) | Helps recovery expectations without server plaintext access. | HIGH | Backend supports encrypted backup blobs + wrapped backup keys only; strict zero-knowledge handling and recovery audit trails. |
| Adaptive trust/risk engine for key events | Better security UX by highlighting unusual key/device churn and session anomalies. | MEDIUM | Metadata-only analytics over key-change velocity, unfamiliar device joins, geo anomalies; never content analysis. |
| Message request and consent gates for first contact | Cuts spam and harassment while preserving E2EE. | MEDIUM | Backend supports pending inbox state, quota buckets, and explicit recipient acceptance before full delivery privileges. |
| Granular group key policies (admin-controlled rekey triggers) | Stronger security posture for sensitive groups and teams. | HIGH | Trigger rekey on role change, member leave, device compromise, or timer policy changes; enforce server-side policy orchestration. |
| Post-quantum migration readiness (hybrid ratchet path) | Future-proofs architecture and can be a major trust differentiator. | HIGH | Build protocol version negotiation and migration envelopes now, even if PQ ratchets are phased in later. |
| Transparency and audit surfaces (key-state attestations) | Builds trust for academic/security-conscious audiences. | MEDIUM | Backend emits signed append-only events for key upload/rotation/deletion and group membership cryptographic state transitions. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Server-side plaintext search/indexing | Feels convenient for "find old messages" | Breaks E2EE trust boundary and expands breach impact massively. | Client-side encrypted index/search only. |
| Server-managed master decryption key / "lawful access" backdoor | Marketed as recovery/compliance shortcut | Single catastrophic compromise point; destroys protocol credibility. | User-controlled recovery secrets + explicit endpoint controls. |
| Automatic contact discovery by unrestricted phone-number enumeration | Easy growth hack | Enables scraping, stalking, and spam at scale. | Rate-limited private contact discovery, username links, invitation tokens. |
| Unlimited message retention by default on backend | Simplifies troubleshooting | Increases metadata and ciphertext exposure window and compliance burden. | Short bounded retention + explicit archival modes. |
| Cross-platform plaintext backup in cloud by default | Reduces migration friction | Cloud provider or account compromise leaks full history. | Opt-in E2EE backups with user-held passphrase or hardware-protected key. |

## Feature Dependencies

```text
Identity and device registration
    -> required by Prekey bundle service
    -> required by Multi-device fanout

Prekey bundle service
    -> required by Pairwise E2EE sessions
    -> required by First-message request flow

Pairwise E2EE sessions
    -> required by Group messaging key distribution
    -> required by Attachment envelope transport

Multi-device fanout
    -> required by Key verification/trust-change signaling
    -> required by Reliable delivery and ordering metadata

Reliable delivery and ordering metadata
    -> required by Disappearing timers enforcement consistency

Group membership state
    -> required by Group rekey policy differentiator

Phone-number privacy and username discovery
    -> enhances Abuse controls (lower unsolicited reachability)

E2EE backup key escrow
    -> conflicts with strict no-backup posture (choose one policy track for MVP)
```

### Dependency Notes

- **Identity/device registration requires Cognito + device key model first:** every downstream encrypted flow assumes authenticated device identities.
- **Prekey service must be built before conversational messaging:** asynchronous first-message delivery depends on one-time prekey retrieval.
- **Reliable delivery metadata is a prerequisite for timer correctness:** disappearing/ephemeral semantics break if delivery and read-state sequencing is weak.
- **Group security depends on membership event integrity:** rekey-on-membership-change only works if backend membership state is strongly consistent.
- **Username discovery and anti-enumeration should launch together:** username-only discovery without abuse controls invites scraping pressure.

## MVP Definition

### Launch With (v1)

Minimum viable product - what is needed to validate the concept.

- [ ] Identity and device registration (Cognito + device key records) - foundational auth and trust anchor.
- [ ] Prekey bundle service and pairwise session bootstrap - enables asynchronous E2EE starts.
- [ ] 1:1 encrypted messaging transport with reliable delivery metadata - validates core messaging loop.
- [ ] Group messaging baseline (membership events + encrypted payload transport) - aligns with project requirements.
- [ ] Attachment envelope transport (encrypted pointer flow) - satisfies v1 attachments scope.
- [ ] Multi-device fanout baseline and trust-change signaling - required for realistic usage and safety alerts.
- [ ] Core abuse controls (rate limit, block/report, unknown sender gating) - required for safe operation.

### Add After Validation (v1.x)

- [ ] Disappearing message policy hardening (timer edge cases, retention audits) - after core delivery correctness is stable.
- [ ] Username-based discovery with phone-number privacy controls - after anti-enumeration and contact-intent flows are proven.
- [ ] E2EE backup (opt-in) - after threat model and key custody UX are validated.
- [ ] Group admin security policies (mandatory rekey triggers) - once baseline group flow is stable.

### Future Consideration (v2+)

- [ ] Sealed-sender style metadata minimization - strong differentiator but protocol and infra heavy.
- [ ] Hybrid post-quantum ratchet migration path - strategic roadmap item, requires protocol versioning and compatibility testing.
- [ ] Transparency log style key-state attestations - valuable for trust and audits after core operations mature.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Identity/device registration | HIGH | MEDIUM | P1 |
| Prekey bundle + session bootstrap | HIGH | HIGH | P1 |
| Reliable encrypted transport | HIGH | HIGH | P1 |
| Group encrypted messaging baseline | HIGH | HIGH | P1 |
| Attachment envelope transport | HIGH | MEDIUM | P1 |
| Multi-device fanout baseline | HIGH | HIGH | P1 |
| Abuse controls baseline | HIGH | MEDIUM | P1 |
| Disappearing message enforcement | MEDIUM | MEDIUM | P2 |
| Username privacy discovery | MEDIUM-HIGH | HIGH | P2 |
| E2EE backup (opt-in) | MEDIUM | HIGH | P2 |
| Sealed-sender style metadata protection | MEDIUM-HIGH | HIGH | P3 |
| Post-quantum migration path | MEDIUM (now), HIGH (later) | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Signal | WhatsApp | Our Approach |
|---------|--------|----------|--------------|
| Default E2EE messaging | Default and protocol-forward | Default at massive scale | Match baseline with strict no-plaintext backend contract. |
| Device and key verification | Safety numbers / verification model | Security notifications and verification flows | Implement trust-change events and verification artifacts early. |
| Disappearing messages | Mature timer controls | Mature timer controls | Include v1 baseline, then harden semantics in v1.x. |
| Multi-device | Linked-device model with constraints | Broad multi-device support | Start with deterministic per-device queues and explicit device lifecycle events. |
| Backup strategy | Local-device oriented and constrained restores | Optional end-to-end encrypted cloud backups | Keep out of v1; design opt-in E2EE backup for v1.x. |
| Phone-number privacy options | Username + phone number privacy controls | Number-centric with privacy controls | Use as differentiator in v1.x with anti-enumeration by design. |

## Sources

- Signal X3DH specification: https://signal.org/docs/specifications/x3dh/
- Signal Double Ratchet specification (rev 4, 2025-11-04): https://signal.org/docs/specifications/doubleratchet/
- Matrix E2EE implementation guide: https://matrix.org/docs/matrix-concepts/end-to-end-encryption/
- Signal support: Safety and trust posture: https://support.signal.org/hc/en-us/articles/360007320391-Is-it-private-Can-I-trust-it
- Signal support: Disappearing messages: https://support.signal.org/hc/en-us/articles/360007320771-Set-and-manage-disappearing-messages
- Signal support: Phone number privacy and usernames: https://support.signal.org/hc/en-us/articles/6712070553754-Phone-Number-Privacy-and-Usernames
- Signal support: Linked devices / multi-device constraints: https://support.signal.org/hc/en-us/articles/360007320451-Troubleshooting-multiple-devices
- Signal support: Backup and restore behavior: https://support.signal.org/hc/en-us/articles/360007059752-Backup-and-Restore-Messages
- WhatsApp privacy feature overview: https://www.whatsapp.com/privacy
- WhatsApp security overview: https://www.whatsapp.com/security/
- Apple Platform Security (iMessage secure delivery model): https://support.apple.com/guide/security/imessage-security-sec70e68c949/web

---
*Feature research for: AWS-based E2EE messaging backend*
*Researched: 2026-03-19*
