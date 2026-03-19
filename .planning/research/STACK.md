# Stack Research

**Domain:** AWS-based end-to-end encrypted messaging backend (Signal protocol + WebSocket realtime)
**Researched:** 2026-03-19
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Amazon API Gateway WebSocket API | Managed service (current) | Realtime bidirectional transport between clients and backend | AWS documents WebSocket APIs as bidirectional and explicitly positions them for realtime chat-style systems; this is the standard managed choice on AWS when you want serverless websocket transport. |
| AWS Lambda | nodejs24.x on Amazon Linux 2023 (preferred), nodejs22.x acceptable | Stateless route handlers for websocket events, auth checks, key-bundle API, fanout orchestration | Lambda runtime docs now include nodejs24.x and recommend moving to AL2023-based runtimes; this is the mainstream 2025-2026 serverless control-plane runtime on AWS. |
| Amazon DynamoDB | Managed service (on-demand capacity + TTL + Streams) | Session/prekey state, ciphertext metadata, device registry, delivery pointers | DynamoDB remains the standard serverless high-throughput metadata store for chat-like fanout patterns with predictable low-latency access and no server ops. |
| Amazon Cognito User Pools | Managed service (OAuth 2.0/OIDC) | User authentication, JWT issuance, federation/SSO | Cognito is AWS-native identity for mobile/web with OAuth 2.0 tokens and direct integration into API auth flows, minimizing custom auth surface area. |
| Amazon S3 + AWS KMS | Managed services (current) | Encrypted attachment object storage + envelope key management | For E2EE messaging, server should store ciphertext blobs and encrypted metadata only; S3+KMS is the standard AWS pattern for durable encrypted payload storage and key custody controls. |
| Amazon SQS FIFO | Managed service (current) | Ordered async delivery pipeline per conversation/device shard | SQS FIFO is the practical standard when you need at-least-once async processing with ordering and retry controls in Lambda-based messaging pipelines. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @signalapp/libsignal-client | 0.89.0 | Signal protocol primitives where backend must validate signed prekeys, identity signatures, and protocol payload structure | Use for protocol-correctness checks and key material validation paths. Keep double-ratchet message encryption/decryption client-side for strict E2EE boundaries. |
| @aws-sdk/client-apigatewaymanagementapi | 3.1012.0 | Post-to-connection sends for API Gateway WebSocket | Use in Lambda handlers that push queued ciphertext events to active websocket connections. |
| @aws-sdk/client-dynamodb + @aws-sdk/lib-dynamodb | 3.1012.0 | DynamoDB access with marshalling helpers | Use for all protocol-state and delivery-metadata persistence. Prefer single-table design with explicit PK/SK modeling. |
| @aws-sdk/client-cognito-identity-provider | 3.1012.0 | Cognito admin/user pool automation | Use for backend-managed account/device workflows and secure bootstrap APIs. |
| jose | 6.2.2 | JWT/JWK validation and JOSE utilities | Use for strict JWT verification and key rotation handling where built-in middleware is insufficient. |
| @middy/core + @middy/http-json-body-parser | 7.2.1 | Lambda middleware pipeline | Use to standardize input validation, auth context hydration, and error mapping across handlers. |
| @aws-lambda-powertools/logger, metrics, tracer | 2.31.0 | Observability baseline for Lambda | Use from day one for structured logs, CloudWatch metrics, and tracing correlation IDs across websocket events. |
| zod | 4.3.6 | Runtime schema validation | Use for all external payload contracts (websocket frames, key registration payloads, attachment metadata APIs). |
| pino | 10.3.1 | Fast structured logging (non-Lambda utilities/workers) | Use in local tooling, queue workers, and shared libraries where Powertools wrapper is not directly used. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript 5.9.3 | Type-safe backend implementation | Pin strict mode; generate types for websocket route contracts and DynamoDB entity models. |
| esbuild 0.27.4 | Fast Lambda bundling | Bundle each handler independently to reduce cold start and package size. |
| Vitest 4.1.0 | Unit/integration testing | Use for protocol flow tests (prekey upload, session bootstrap, message enqueue/dequeue). |
| aws-cdk-lib 2.243.0 | Optional IaC once manual setup stabilizes | Use after architecture validation milestone to codify websocket routes, IAM, DynamoDB, and queue topology. |

## Installation

```bash
# Core
npm install @aws-sdk/client-apigatewaymanagementapi @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-cognito-identity-provider @signalapp/libsignal-client

# Supporting
npm install jose zod pino @middy/core @middy/http-json-body-parser @aws-lambda-powertools/logger @aws-lambda-powertools/metrics @aws-lambda-powertools/tracer

# Dev dependencies
npm install -D typescript esbuild vitest @types/aws-lambda aws-cdk-lib
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| API Gateway WebSocket + Lambda | ECS/Fargate websocket gateway (uWebSockets.js/Socket.IO) | Use ECS/Fargate if you need very high sustained concurrent sockets and tighter control of connection lifecycle/cost profile than API Gateway provides. |
| DynamoDB single-table metadata store | Aurora PostgreSQL | Use Aurora when cross-entity ad-hoc SQL analytics and relational joins are first-class product requirements, not just operational messaging metadata. |
| Cognito User Pools | Auth0 / self-hosted Keycloak | Use alternative IdP if you require advanced enterprise federation workflows that materially exceed Cognito feature fit. |
| @signalapp/libsignal-client | Custom crypto implementation | Use custom crypto only for research prototypes; never for production-like systems where protocol drift and cryptographic footguns are unacceptable. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| libsignal-protocol-javascript (legacy package) | npm registry lookup returns not found (E404) and it is not a dependable modern baseline for 2025-2026 greenfield work | @signalapp/libsignal-client |
| Long-polling REST as primary realtime channel | Increases latency, battery/network cost, and complexity for delivery state; not standard for modern chat transport | API Gateway WebSocket APIs |
| Self-managed websocket fleet on EC2 for v1 | Adds heavy ops burden (autoscaling, draining, patching, fault handling) before core protocol correctness is validated | Managed API Gateway WebSocket + Lambda |
| Storing plaintext message content server-side | Violates E2EE trust model and broadens breach impact | Store ciphertext blobs/metadata only; keep encryption/decryption client-side |

## Stack Patterns by Variant

**If v1 scope is academic MVP (security-first, moderate scale):**
- Use API Gateway WebSocket + Lambda + DynamoDB + SQS FIFO + Cognito
- Because this minimizes ops and lets the team focus on Signal protocol correctness and key lifecycle discipline

**If growth target is very high sustained concurrency and strict p99 latency/cost tuning:**
- Use hybrid: API Gateway for control plane, ECS/Fargate websocket edge for hot paths
- Because dedicated websocket workers can outperform pure serverless for extreme steady-state connection density

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Lambda nodejs24.x | AWS SDK for JavaScript v3.1012.0 | Current Lambda docs list nodejs24.x; v3 SDK line is actively updated and standard for Node Lambda. |
| @middy/core 7.2.1 | TypeScript 5.9.3 | Strong fit for typed middleware pipelines in modern Lambda codebases. |
| @signalapp/libsignal-client 0.89.0 | Node.js 22/24 Lambda-compatible build pipelines | Validate native/binary packaging strategy early in CI for Lambda deployment artifacts. |
| @aws-lambda-powertools/* 2.31.0 | Lambda Node.js 22/24 | Use consistently across handlers for coherent tracing/log/metrics semantics. |

## Recommendation Confidence

| Recommendation Area | Confidence | Notes |
|---------------------|------------|-------|
| AWS service choices (API Gateway WebSocket, Lambda, DynamoDB, Cognito, SQS, S3/KMS) | HIGH | Backed by official AWS docs and standard serverless messaging architecture patterns. |
| Runtime target (nodejs24.x on AL2023) | HIGH | Explicitly supported in current Lambda runtime docs; AWS guidance recommends AL2023 migration. |
| Library version pins (AWS SDK v3, Powertools, Middy, Zod, Jose) | HIGH | Verified from npm registry metadata on 2026-03-19. |
| Signal library recommendation (@signalapp/libsignal-client) | HIGH | Active upstream package with very recent publish metadata and Signal-maintained repository link. |
| Hybrid ECS websocket variant threshold guidance | MEDIUM | Common architecture pattern but workload thresholds are deployment-specific and must be validated with load testing. |

## Sources

- https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html - verified runtime identifiers (including nodejs24.x), AL2 EOL note, and AL2023 migration recommendation.
- https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html - verified API Gateway WebSocket is bidirectional and positioned for realtime chat.
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html - verified DynamoDB serverless/high-scale characteristics and on-demand model.
- https://docs.aws.amazon.com/cognito/latest/developerguide/what-is-amazon-cognito.html - verified Cognito OAuth 2.0/OIDC identity platform positioning.
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html - official FIFO queue semantics reference.
- npm registry metadata (queried 2026-03-19): @signalapp/libsignal-client, @aws-sdk/client-dynamodb, @aws-sdk/client-apigatewaymanagementapi, @aws-sdk/client-cognito-identity-provider, @aws-sdk/lib-dynamodb, jose, zod, pino, @aws-lambda-powertools/*, @middy/*, typescript, esbuild, vitest, aws-cdk-lib.

---
*Stack research for: AWS-based E2EE messaging backend with Signal protocol and WebSocket transport*
*Researched: 2026-03-19*
