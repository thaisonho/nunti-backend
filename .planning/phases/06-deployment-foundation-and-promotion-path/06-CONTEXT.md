# Phase 6: Deployment Foundation and Promotion Path - Context

**Gathered:** 2026-04-03  
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish repeatable AWS deployment with immutable promotion and rollback for the existing backend. This phase covers deployment scaffolding, environment promotion workflow, artifact provenance, and rollback mechanics for staging and production. It excludes live runtime hardening, protocol behavior changes, and feature-level validation beyond deployment health.

</domain>

<decisions>
## Implementation Decisions

### Deployment substrate and stack shape
- [auto] Use AWS SAM on top of CloudFormation as the deployment substrate.
- [auto] Keep staging and production as distinct stack targets built from the same template.
- [auto] Preserve the current TypeScript build output as the deployable application artifact; deployment packages are produced from `dist/` after `npm run build`.
- [auto] Do not introduce a second packaging format in this phase; one immutable packaged release artifact is the promotion unit.

### Release and promotion flow
- [auto] Use the existing Git Flow release branch model as the release vehicle for deployment promotion.
- [auto] Staging deploys from a versioned release artifact produced once from the release branch.
- [auto] Production promotion reuses the exact same artifact version that passed staging, rather than rebuilding from source.
- [auto] `main` is updated only after the release artifact has been promoted successfully.

### Rollback behavior
- [auto] Rollback is explicit and artifact-based: redeploy the previous known-good release artifact, not manual console edits.
- [auto] Keep deployment history versioned so the previous approved artifact remains addressable for both staging and production.
- [auto] CloudFormation rollback on failed deploys is acceptable, but operator-initiated rollback should use the prior approved artifact/version.

### Environment configuration and secrets
- [auto] Preserve the current env-var runtime contract in `src/app/config.ts`.
- [auto] Inject per-environment values through stack parameters and Lambda environment variables.
- [auto] Use SSM Parameter Store for non-secret deployment configuration when values must be externalized.
- [auto] Do not add new runtime config access patterns in this phase.
- [auto] Secrets Manager is reserved for actual secrets; Phase 6 should not invent new secret dependencies.

### Promotion gates
- [auto] Phase 6 promotion gates stop at deployment success and stack health signals.
- [auto] Staging must reach a successful deployed state before production promotion is allowed.
- [auto] Functional message-flow validation remains a later phase and is not part of Phase 6 acceptance.

### Claude's Discretion
- Exact SAM template layout and logical resource naming.
- Exact artifact naming/versioning convention for packaged releases.
- Exact workflow file names and job structure for build, deploy, promotion, and rollback.
- Exact Parameter Store key paths and environment variable mapping.

</decisions>

<specifics>
## Specific Ideas

- Keep the deployment path deterministic and auditable so the same artifact can be traced from staging approval to production rollout.
- Prefer a minimal deployment surface that fits the repository's current TypeScript/Lambda shape instead of introducing unnecessary infrastructure layers.
- Treat deployment health and promotion provenance as the phase goal; live protocol validation belongs to the later runtime-validation phase.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement authority
- `.planning/ROADMAP.md` - Fixed Phase 6 boundary, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` - DEP-01 and DEP-02 obligations.
- `.planning/PROJECT.md` - Live AWS launch goal, AWS serverless constraint, and backend-only scope.
- `.planning/STATE.md` - Current milestone and phase progression context.

### Release and governance conventions
- `CONTRIBUTING.md` - Git Flow branch roles and PR base branch rules.
- `.github/pull_request_template.md` - Release branch and rollback governance checklist.
- `.github/rulesets/main.json` - Main/develop protections and required checks.
- `.github/workflows/governance-commitlint.yml` - Existing release governance gate.

### Existing runtime and build patterns
- `package.json` - Current build/test scripts and dependency set.
- `tsconfig.json` - TypeScript build target and output shape.
- `src/app/config.ts` - Env-var-driven runtime config contract and `stage` handling.
- `src/app/errors.ts` - Existing machine-readable error contract style.

### Existing automation surface
- `.github/workflows/governance-pr-title.yml` - Existing GitHub Actions convention for governance checks.
- `.github/workflows/governance-commitlint.yml` - Existing GitHub Actions convention for governance checks.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json`: build/test entry points already exist, and `npm run build` produces deployable TypeScript output.
- `src/app/config.ts`: already models environment-specific runtime configuration with a `stage` field and strict fail-fast required variables.
- `CONTRIBUTING.md`: already codifies Git Flow, so deployment promotion can align with release branch conventions instead of inventing a new process.

### Established Patterns
- The codebase already expects environment-driven configuration rather than direct secret lookup in application code.
- Governance checks are already separated from application logic, so deployment automation can layer on top of the existing branch policy without changing it.
- The repository is Lambda-friendly today because it already compiles to CommonJS output and uses AWS SDK clients directly.

### Integration Points
- Deployment workflow steps need to set the env vars that `src/app/config.ts` expects for each environment.
- Release packaging should consume the same compiled output that the application tests already validate.
- Promotion metadata should be visible to downstream planning and later ops work so the same artifact/version can be traced across staging and production.

</code_context>

<deferred>
## Deferred Ideas

- Multi-account deployment orchestration details.
- Full live runtime validation gates for auth context, fanout/replay, trust-change, and attachment transport.
- Secret rotation and live security hardening policies.

</deferred>

---

*Phase: 06-deployment-foundation-and-promotion-path*  
*Context updated: 2026-04-03*
