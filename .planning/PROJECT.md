# AWS E2EE Messaging Backend

## What This Is

This project delivers the backend of an end-to-end encrypted messaging platform using AWS-oriented architecture and Signal-style protocol workflows.

## Core Value

Enable users to exchange and synchronize encrypted messaging metadata reliably while preserving protocol correctness and end-to-end confidentiality.

## Current State

- v1.0 shipped on 2026-04-02.
- Completed scope: governance baseline, identity/device access, key bootstrap lifecycle, reliable 1:1 messaging, and group fanout with attachment envelope transport.
- v1.0 archive: `.planning/milestones/v1.0-ROADMAP.md` and `.planning/milestones/v1.0-REQUIREMENTS.md`.

## Current Milestone: v1.1 Live AWS Launch

**Goal:** Deploy the backend to a live AWS environment and validate production-like runtime behavior for encrypted realtime messaging flows.

**Target features:**
- Deploy backend services to live AWS with repeatable release workflow.
- Validate AWS runtime behavior for WebSocket auth context, fanout/replay, trust-change, and attachment flows.
- Add security hardening for live operation (IAM least privilege and production-safe defaults).

## Active Requirements

- [ ] Deploy backend stack and configuration to live AWS.
- [ ] Execute and pass end-to-end AWS validation for realtime messaging flows.
- [ ] Implement security hardening needed for live deployment readiness.

## Constraints

- Platform remains AWS serverless: API Gateway WebSocket, Lambda, DynamoDB, Cognito.
- Cryptography remains Signal-style E2EE and metadata-only backend handling.
- Scope remains backend-first; frontend/client UX is out of scope.

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| Use AWS API Gateway WebSocket for realtime backend communication | Managed WebSocket infrastructure integrates with Lambda event model | ✓ Adopted in v1.0 |
| Use AWS Lambda for core backend logic | Serverless fits event-driven messaging pipelines | ✓ Adopted in v1.0 |
| Use AWS DynamoDB for protocol and messaging state | Key-value/document model fits prekey/session/message metadata | ✓ Adopted in v1.0 |
| Use AWS Cognito for identity and SSO | Native AWS identity service simplifies auth integration | ✓ Adopted in v1.0 |
| Use Git Flow + PR review + Conventional Commits | Team needs auditable collaboration and consistent change history | ✓ Adopted in v1.0 |

---
Last updated: 2026-04-02 after starting milestone v1.1
