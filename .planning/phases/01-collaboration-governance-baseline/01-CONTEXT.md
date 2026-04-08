# Phase 1: Collaboration Governance Baseline - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish an enforceable and auditable team collaboration workflow for backend delivery using Git Flow, peer-reviewed pull requests, and Conventional Commits. This phase defines collaboration governance only; it does not add product/backend runtime capabilities.

</domain>

<decisions>
## Implementation Decisions

### Git Flow branch boundaries
- Long-lived protected branches are `main` and `develop`.
- Feature branches use the naming convention `feature/<ticket-or-short-slug>`.
- Release flow is standard Git Flow: create `release/*` from `develop`, merge to `main`, then back-merge to `develop`.
- Hotfix flow is standard Git Flow: create `hotfix/*` from `main`, merge to `main`, and sync into `develop`.

### PR review gate policy
- Merges into protected integration branches require at least 1 approval.
- PR authors cannot self-approve, but can self-merge after external approval.
- New commits on a PR dismiss stale approvals and require re-approval.
- All configured status checks are required to pass before merge on protected branches.

### Conventional Commit contract
- Accepted commit types are: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scope is optional but encouraged (example: `feat(auth): ...`).
- Breaking changes must be declared using `!` in type/scope and/or a `BREAKING CHANGE:` footer.
- Squash merge commit messages must also follow Conventional Commits format.

### Claude's Discretion
- Exact branch protection rule expressions and repository settings encoding.
- Exact linting/hook tooling stack selection to enforce Conventional Commits.
- CI check naming and implementation details for branch protection integration.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement authority
- `.planning/ROADMAP.md` — Defines Phase 1 boundary, goal, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` — Defines GIT-01, GIT-02, GIT-03 requirement obligations.
- `.planning/PROJECT.md` — Defines project-level collaboration constraints and auditability expectations.
- `.planning/STATE.md` — Confirms current phase focus and execution readiness.

### Workflow and context templates
- `.github/get-shit-done/workflows/discuss-phase.md` — Governs discuss-phase output expectations and scope guardrails.
- `.github/get-shit-done/templates/context.md` — Structure contract for CONTEXT.md consumed by researcher/planner.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/get-shit-done/bin/gsd-tools.cjs`: Existing project automation entry point that can be used for governance/documentation commit workflows.
- `.github/get-shit-done/references/git-integration.md`: Existing git integration reference material that can guide policy implementation details.
- `.github/get-shit-done/references/git-planning-commit.md`: Existing commit workflow reference useful for auditable planning commits.

### Established Patterns
- Governance/process knowledge is documentation-first under `.planning/` and `.github/get-shit-done/`.
- The repository already centralizes workflow contracts in markdown files and templates, indicating policy should be codified as explicit docs/config, not tribal knowledge.

### Integration Points
- Phase artifacts should live under `.planning/phases/01-collaboration-governance-baseline/`.
- Branch protection, PR approval, and commit policy enforcement will integrate with Git hosting rules plus repo-level config/docs.
- Follow-on planning should map each governance decision to concrete repo controls and contributor-facing documentation.

</code_context>

<specifics>
## Specific Ideas

- Keep governance strict enough for auditability while preserving a practical team flow (1 required approval rather than 2).
- Use canonical Git Flow semantics for release and hotfix so contributors can follow familiar workflows.
- Maintain classifiable git history by enforcing Conventional Commit format on squash merges as well as regular commits.

</specifics>

<deferred>
## Deferred Ideas

- Governance exceptions and emergency bypass policy details were identified as a potential gray area but intentionally deferred from this context capture.

</deferred>

---

*Phase: 01-collaboration-governance-baseline*
*Context gathered: 2026-03-19*
