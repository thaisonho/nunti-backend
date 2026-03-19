# AWS E2EE Messaging Backend

## What This Is

This project builds the server side of an AWS-based end-to-end encrypted messaging application for a school team project. The backend provides identity, signaling, session bootstrapping, and message transport orchestration while keeping message content encrypted end-to-end using the Signal Protocol family of cryptographic mechanisms. Clients communicate through AWS API Gateway WebSocket, with serverless logic on AWS Lambda, persistence on AWS DynamoDB, and SSO via AWS Cognito.

## Core Value

Enable users to exchange and synchronize messages and related metadata reliably while preserving end-to-end confidentiality and protocol correctness.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Provide secure user identity and authentication integration using AWS Cognito for client access control.
- [ ] Support Signal-style key lifecycle and session establishment flows for multi-device E2EE messaging.
- [ ] Deliver real-time messaging transport through AWS API Gateway WebSocket and Lambda orchestration.
- [ ] Persist required encrypted payload metadata and protocol state safely in AWS DynamoDB.
- [ ] Support v1 capabilities: 1:1 text messaging, group messaging, attachments, and device key management.
- [ ] Establish strong git governance for team collaboration with Git Flow, pull request review, and Conventional Commits.

### Out of Scope

- Full production-grade compliance certification — this is an academic project with strong technical rigor but not formal enterprise certification.
- Manual unmanaged code changes without review — excluded to preserve team traceability and quality.

## Context

This is a school project with no hard deadline, but quality and correctness are prioritized. Security posture target is strong academic-grade: protocol correctness, key lifecycle discipline, auditable architecture choices, and practical abuse resistance where feasible. Infrastructure setup preference is manual AWS setup first, with potential IaC adoption later. Success for early milestone is security architecture validation, alongside demonstrable E2EE backend workflows.

## Constraints

- **Platform**: AWS serverless stack (API Gateway WebSocket, Lambda, DynamoDB, Cognito) — fixed core architecture from project intent.
- **Cryptography**: Signal Protocol-based E2EE flows — central technical requirement for messaging and calling-related signaling readiness.
- **Scope**: Backend-first implementation — client UX implementation is out of current scope.
- **Collaboration**: Git Flow with mandatory pull request review and Conventional Commits — team project must be carefully tracked.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use AWS API Gateway WebSocket for realtime backend communication | Managed WebSocket infrastructure integrates cleanly with Lambda event model | — Pending |
| Use AWS Lambda for core backend logic | Serverless reduces ops overhead and fits event-driven messaging pipelines | — Pending |
| Use AWS DynamoDB for protocol and messaging state | Scalable key-value/document model suits session/prekey/message metadata patterns | — Pending |
| Use AWS Cognito for identity and SSO | Native AWS identity service simplifies auth integration for team project scope | — Pending |
| Use Git Flow + PR review + Conventional Commits | Team needs auditable, structured, low-chaos collaboration | — Pending |

---
*Last updated: 2026-03-19 after project initialization questioning*
