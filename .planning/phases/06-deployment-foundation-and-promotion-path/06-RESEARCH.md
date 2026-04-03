# Phase 6: Deployment Foundation and Promotion Path - Research

**Researched:** 2026-04-03
**Domain:** Deterministic AWS SAM deployment and immutable promotion workflow for staging/production
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Deployment substrate is AWS SAM on top of CloudFormation.
- Staging and production are separate stack targets from the same template.
- Deployable app artifact comes from `npm run build` output under `dist/`.
- Do not introduce a second packaging format in this phase.
- Promotion must reuse the exact artifact that passed staging (no rebuild for production).
- Release flow must follow existing Git Flow release branch conventions.
- Rollback is explicit and artifact-based using the previous approved artifact.
- Runtime env contract in `src/app/config.ts` is preserved.
- Environment values are injected via stack parameters/Lambda environment variables.
- Parameter Store is for non-secret config, Secrets Manager only for real secrets.
- Promotion gates in this phase stop at deployment success and stack health.

### Claude's Discretion
- SAM template decomposition and logical IDs.
- Artifact naming/versioning convention.
- Workflow file/job structure.
- Parameter Store path naming and env mapping details.

### Deferred Ideas (OUT OF SCOPE)
- Multi-account orchestration details.
- Full live runtime validation for auth/fanout/replay/trust/attachments.
- Secret rotation and advanced hardening policies.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEP-01 | Team can deploy backend stacks to live AWS using a repeatable, versioned workflow across staging and production. | Versioned GitHub Actions release workflow + shared SAM template and environment parameter files. |
| DEP-02 | Team can promote immutable build artifacts across environments with explicit rollback capability. | Build-once release manifest + production promotion without rebuild + rollback workflow to previous manifest. |
</phase_requirements>

## Summary

Phase 6 should add a deployment automation layer without changing application runtime behavior. The strongest fit is: keep current TypeScript build contract (`npm run build` -> `dist/`), introduce SAM infrastructure as code with environment-specific parameter files, and use release-tag-based workflows that produce one immutable packaged artifact consumed by both staging and production.

The critical quality property is provenance: every promoted production deployment references the same template + package digest that already passed staging. Rollback should redeploy a previously approved release manifest rather than rebuilding source or editing AWS console settings.

## Existing Architecture Fit

### Reuse directly
- `package.json` build script (`npm run build`) as canonical compile step.
- `src/app/config.ts` required environment variable contract (`COGNITO_*`, `DEVICES_TABLE_NAME`, `MESSAGES_TABLE_NAME`, `STAGE`).
- Existing GitHub governance conventions under `.github/workflows/` and branch policy documented in `CONTRIBUTING.md`.

### Additive modules (recommended)
- `template.yaml` (SAM template) for Lambda/API/DynamoDB/Cognito wiring.
- `deploy/params.staging.json` and `deploy/params.production.json` for stack parameter values.
- `deploy/release-manifest.schema.json` to define immutable promotion unit.
- `.github/workflows/release-deploy.yml` to build/package/deploy release tags to staging.
- `.github/workflows/release-promote.yml` to promote same artifact to production.
- `.github/workflows/release-rollback.yml` for explicit rollback to prior approved artifact.
- `scripts/deploy/*.sh` for deterministic packaging/deployment wrapper commands.
- `docs/deployment/release-promotion-runbook.md` for operator flow and rollback steps.

## Standard Stack

| Tool | Purpose | Why Standard |
|------|---------|--------------|
| AWS SAM CLI | Build/package/deploy CloudFormation-managed serverless stacks | Locked by user decision and best fit for Lambda/API Gateway stack definition. |
| CloudFormation change sets | Deterministic rollout + rollback-safe stack updates | Native provenance and drift-safe deployment model. |
| GitHub Actions | Versioned release workflow automation | Already used in repo for governance checks. |
| S3 artifact storage (SAM package output) | Immutable artifact promotion unit | Enables deploy-once/promote-same-artifact requirement. |

## Recommended Release Artifact Contract

Create a release manifest (JSON) generated once for each release tag:

```json
{
  "releaseVersion": "v1.1.0",
  "gitSha": "<commit sha>",
  "templatePath": "packaged.template.yaml",
  "templateSha256": "<sha256>",
  "artifactBucket": "<bucket>",
  "artifactPrefix": "releases/v1.1.0/",
  "packageCommandVersion": "sam-cli:<version>",
  "builtAt": "<iso8601>"
}
```

Production promotion and rollback should consume this manifest as input.

## Parameter and Environment Mapping

Required runtime keys from `src/app/config.ts` map to SAM parameters and Lambda environment:
- `COGNITO_USER_POOL_ID`
- `COGNITO_APP_CLIENT_ID`
- `COGNITO_REGION`
- `DEVICES_TABLE_NAME`
- `MESSAGES_TABLE_NAME`
- `STAGE`

Recommended non-secret SSM parameters:
- `/nunti/{stage}/cognito/user-pool-id`
- `/nunti/{stage}/cognito/app-client-id`
- `/nunti/{stage}/tables/devices`
- `/nunti/{stage}/tables/messages`

## Common Pitfalls and Mitigations

1. Rebuild during production promotion.
- Risk: production bits differ from staging-approved bits.
- Mitigation: promotion workflow accepts only manifest from staging run; forbid `npm run build` in promote workflow.

2. Hidden manual console edits.
- Risk: non-deterministic environment state and rollback drift.
- Mitigation: all stack updates through versioned workflow + SAM template + parameter files.

3. Rollback to source commit instead of artifact.
- Risk: rollback may include unintended dependency/runtime changes.
- Mitigation: rollback workflow takes previous approved manifest ID and redeploys packaged template.

4. Runtime config mismatch.
- Risk: Lambda starts with missing env vars and fails at `getConfig()`.
- Mitigation: parameter validation in deployment scripts and explicit mapping checks in CI steps.

## Validation Architecture

Validation in this phase focuses on deployment correctness and provenance, not feature-level protocol behavior.

### Required checks by release flow
1. Build check: `npm run build` succeeds.
2. Template check: SAM template validates and contains required parameters/env mapping.
3. Staging deploy check: stack update completes successfully.
4. Promotion check: production deploy references same `templateSha256` and artifact prefix as staging-approved manifest.
5. Rollback check: previous manifest can be redeployed to restore known-good release.

### Evidence artifacts
- Release manifest JSON per tag.
- Workflow run logs for staging deploy, production promotion, and rollback.
- Stack outputs/events captured in CI logs.

## Implementation Waves

### Wave 1: Deployment foundation (DEP-01)
- Define release manifest contract.
- Add SAM template + stage/prod parameter files.
- Add release deploy workflow that builds once and deploys to staging.

### Wave 2: Immutable promotion and rollback (DEP-02)
- Add production promote workflow consuming staging-approved manifest only.
- Add explicit rollback workflow selecting prior approved manifest.
- Add runbook documenting promotion and rollback operator commands.

## Don’t Hand-Roll

| Problem | Don’t Build | Use Instead |
|---------|-------------|-------------|
| Infrastructure drift fixes | Manual AWS Console edits | SAM/CloudFormation updates through workflows |
| Artifact provenance tracking | Ad hoc log notes | Versioned manifest file committed/stored per release |
| Rollback logic | Custom one-off scripts per incident | Standardized rollback workflow parameterized by manifest |
