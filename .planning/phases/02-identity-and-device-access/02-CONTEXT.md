# Phase 2: Identity and Device Access - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable secure user authentication and trusted-device access control for backend participation. This phase covers Cognito email/password signup/signin, protected-route JWT claim validation behavior, and trusted device participation boundaries. It does not add social discovery capabilities.

</domain>

<decisions>
## Implementation Decisions

### Auth flow behavior
- Email verification gating before first successful sign-in is left flexible for planning/research.
- Password policy posture should use Cognito standard/default complexity baseline.
- Failed sign-in responses should favor generic messaging to reduce account-enumeration risk.
- New sign-in on one device should not force sign-out on other existing devices.
- Canonical login identity remains email.
- Verification resend should be available with cooldown messaging.
- Failed-attempt protections should rely on Cognito managed controls (no custom lockout policy in this phase).
- Active device/session visibility should be included at a basic level.
- First successful sign-in on a device should auto-register that device as trusted.
- Display-name collection is not required in this phase.

### Account handle direction (scope-bounded)
- Directionally support account handle/username data for future use.
- Handle policy preference: unique, lowercase, editable with limits.
- User discovery/search by handle is deferred to a future phase and is out of Phase 2 scope.

### Protected-route rejection contract
- Use `401` for missing/invalid token cases; use `403` only when token is valid but lacks permission.
- JWT rejection responses should provide a stable machine-readable error code plus generic human-facing message.
- Expired tokens should return an explicit token-expired machine code to support client re-auth flow.
- Missing-token and malformed-token responses should share the same generic external message.

### Claude's Discretion
- Exact verification-gating behavior (pre-signin hard gate vs restricted verified-state approach).
- Exact response envelope field names for error contract and machine code taxonomy.
- Detailed session/device visibility fields.
- Device revocation interaction specifics not discussed here (must still satisfy AUTH-03 in planning).

</decisions>

<specifics>
## Specific Ideas

- User emphasized a future model similar to Telegram/Instagram where account discovery uses username/handle rather than email.
- Current phase should keep auth/device trust focused and avoid expanding into social discovery/search.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement authority
- `.planning/ROADMAP.md` - Defines Phase 2 scope, dependencies, and success criteria.
- `.planning/REQUIREMENTS.md` - Defines AUTH-01, AUTH-02, AUTH-03 obligations.
- `.planning/PROJECT.md` - Defines fixed AWS stack direction and Cognito identity baseline.
- `.planning/STATE.md` - Confirms current planning/execution state and milestone context.

### Prior decision continuity
- `.planning/phases/01-collaboration-governance-baseline/01-CONTEXT.md` - Establishes enforcement/audit discipline that should carry into phase planning artifacts.

### Workflow contracts
- `.github/get-shit-done/workflows/discuss-phase.md` - Defines discuss-phase scope guardrails and output expectations.
- `.github/get-shit-done/templates/context.md` - Defines CONTEXT.md structure contract for downstream agents.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `commitlint.config.mjs`: Established repository quality gate pattern for policy enforcement.
- `.github/workflows/governance-commitlint.yml` and `.github/workflows/governance-pr-title.yml`: Existing CI enforcement pattern that Phase 2 can mirror for auth/device contract checks.
- `.github/rulesets/main.json` and `.github/rulesets/develop.json`: Existing ruleset-as-code convention for enforceable governance controls.
- `.github/scripts/verify-governance-artifacts.sh`: Existing verification-script pattern for measurable phase acceptance checks.

### Established Patterns
- Documentation-first planning and phase artifacts under `.planning/` are the current source of truth.
- Governance enforcement is codified as versioned files plus CI checks, suggesting Phase 2 should preserve explicit, auditable contracts.
- No runtime backend source tree is present yet; Phase 2 likely establishes initial runtime/API foundation.

### Integration Points
- New phase artifacts belong under `.planning/phases/02-identity-and-device-access/`.
- Phase 2 planning should define protected-route auth behavior and device authorization contracts in a way that can be validated similarly to Phase 1 governance checks.
- Runtime integration points (API handlers/routes/services) will be created in this phase because they do not currently exist in the repository.

</code_context>

<deferred>
## Deferred Ideas

- User discovery/search by username/handle (explicitly deferred; separate future capability).
- Any profile/social identity experience beyond auth/device trust boundaries.

</deferred>

---

*Phase: 02-identity-and-device-access*
*Context gathered: 2026-03-19*
