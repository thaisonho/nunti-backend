# Phase 7: Security Hardening for Live Runtime - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Live runtime enforces least-privilege access and production-safe auth/secret protections by default. This phase hardens IAM boundaries, JWT validation behavior, secret handling defaults, and sensitive logging posture. It does not add new product capabilities.

</domain>

<decisions>
## Implementation Decisions

### IAM least-privilege boundary
- Staging and production must use separate deploy roles (same AWS account is acceptable).
- OIDC trust for deploy roles should be constrained to release workflows/tags only.
- Runtime Lambda IAM should be strict: scope by table, action, and key-prefix where applicable.
- AdministratorAccess bootstrap is not acceptable as a default; treat it as break-glass only and explicitly documented.

### JWT enforcement matrix
- WebSocket query-parameter token fallback should be disallowed in production; Authorization header is required there.
- Protected routes should accept both access and ID tokens.
- Trusted-device checks are not required globally for every protected route.
- Existing route-specific trusted-device checks on sensitive flows (for example WebSocket connect and `/v1/me`) should remain in place.
- Keep one stable external machine code for claim-validation failures; preserve generic human-facing auth messages.

### Secrets source-of-truth policy
- AWS Secrets Manager is the canonical store for sensitive runtime values.
- Repository parameter JSON files remain placeholders only; no real secret values are committed.
- Missing required secret values must fail closed (no insecure fallback defaults).
- Non-sensitive runtime config (for example Cognito IDs, table names, region, stage) remains standard config, not secret material.

### Log redaction contract
- Default warning/error logs should redact or hash user/device identifiers.
- Raw token material (Authorization headers, query tokens) must never be logged.
- Message route payload bodies should not be logged by default.
- Required triage fields to preserve in logs: requestId, error code, route/eventType, timestamp.

### Claude's Discretion
- Exact redaction/hashing representation format for identifiers (for example stable hash vs masked suffix).
- Exact route matrix defining where ID-token acceptance is allowed versus denied.
- Exact IAM condition policy syntax and key-prefix enforcement technique for DynamoDB.
- Exact secret retrieval lifecycle implementation details (initialization path, caching, and error propagation shape).

</decisions>

<specifics>
## Specific Ideas

- Security hardening must remain production-safe by default (no permissive bootstrap defaults leaking into live environments).
- Auth failures should remain externally generic and machine-readable, consistent with prior phases.
- Keep compatibility where needed, but not at the expense of production token leakage risks.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement authority
- `.planning/ROADMAP.md` - Defines Phase 7 goal, dependency, and success criteria.
- `.planning/REQUIREMENTS.md` - Defines SEC-01 and SEC-02 obligations.
- `.planning/PROJECT.md` - Defines v1.1 launch scope and fixed platform constraints.
- `.planning/STATE.md` - Current execution context and milestone continuity.

### Prior phase continuity
- `.planning/phases/02-identity-and-device-access/02-CONTEXT.md` - Locked auth error semantics and protected-route behavior baseline.
- `.planning/phases/04-reliable-1-1-messaging-core/04-CONTEXT.md` - Structured machine-readable error/event contract continuity.
- `.planning/phases/05-groups-fanout-and-attachments/05-CONTEXT.md` - Realtime event handling continuity and replay-safe behavior constraints.

### Security and deployment surfaces in current codebase
- `template.yaml` - Current environment/config injection baseline for runtime.
- `src/auth/jwt-verifier.ts` - Existing issuer/audience/token_use claim verification baseline.
- `src/auth/auth-guard.ts` - Current bearer parsing and claim-failure mapping entrypoint.
- `src/auth/websocket-auth.ts` - Current WS token-source behavior and trusted-device check path.
- `src/app/config.ts` - Runtime configuration loading and required env contract.
- `src/realtime/message-relay-publisher.ts` - Current warning-log metadata exposure patterns.
- `src/realtime/group-relay-publisher.ts` - Current warning-log metadata exposure patterns.
- `scripts/infra/setup-oidc-s3.sh` - OIDC role bootstrap defaults and admin-access toggle behavior.
- `.github/workflows/release-deploy.yml` - Release-triggered deployment trust surface.
- `.github/workflows/release-promote.yml` - Promotion workflow trust and role usage surface.
- `.github/workflows/release-rollback.yml` - Rollback workflow trust and environment role selection surface.
- `docs/deployment/environment-configs.md` - Current operator-facing secret/config setup expectations.

### External specs
- No external ADR/spec documents were referenced in this discussion; decisions above are canonical for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/auth/jwt-verifier.ts`: already centralizes Cognito claim verification and is the natural place to extend strict token acceptance rules.
- `src/auth/auth-guard.ts`: reusable protected-route auth gate with locked machine-code mapping.
- `src/auth/websocket-auth.ts`: existing token-source selection and sensitive-route trusted-device enforcement path.
- `src/app/config.ts`: central runtime config contract where secret-vs-config classification can be enforced.
- `scripts/infra/setup-oidc-s3.sh`: existing OIDC role bootstrap path to harden toward least-privilege defaults.

### Established Patterns
- Auth errors are machine-readable with generic human-facing messages.
- Protected-route checks rely on reusable auth/device policy modules.
- Deployment uses OIDC-based GitHub Actions roles and manifest-driven promotion.
- Runtime logs currently emit structured metadata objects around realtime publish failures.

### Integration Points
- IAM hardening spans infra bootstrap script, GitHub workflow role assumptions, and SAM/runtime permissions.
- JWT policy hardening spans HTTP + WebSocket auth entrypoints and verifier configuration.
- Secret policy hardening spans deployment docs/config, runtime config loading, and environment contracts.
- Log redaction hardening spans WebSocket handlers and realtime publisher warning/error paths.

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within Phase 7 scope.

</deferred>

---

*Phase: 07-security-hardening-for-live-runtime*
*Context gathered: 2026-04-09*
