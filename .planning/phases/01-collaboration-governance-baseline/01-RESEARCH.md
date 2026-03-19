# Phase 1: Collaboration Governance Baseline - Research

## Standard Stack

Use a GitHub-first governance baseline with server-side enforcement (not local-only hooks) so policy is auditable and cannot be bypassed by contributor machine setup.

Recommended stack for this repository:

- Git hosting controls: GitHub repository Rulesets targeting main and develop.
- Merge strategy: Allow squash merge, set default squash commit message to PR title only, and require pull request before merging.
- Review gate: Required approvals = 1 on protected branches, dismiss stale approvals on new commits, require all conversations resolved.
- Status checks: Required checks on protected branches must include:
  - governance/pr-title
  - governance/commitlint
- Conventional Commit policy:
  - Spec basis: Conventional Commits 1.0.0.
  - Allowed types for this repo: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- CI enforcement:
  - PR title lint: amannn/action-semantic-pull-request@v6 (job name: governance/pr-title).
  - Commit message lint in PR commits: wagoid/commitlint-github-action@v6 (job name: governance/commitlint) with commitlint.config.mjs.
- Commit lint config at repo root:
  - commitlint.config.mjs extending @commitlint/config-conventional.
  - type-enum narrowed to the Phase 1 allowed list above.

Verification-oriented guidance (convert to tasks):

- Task check 1: Ruleset exists for main and develop with require PR + 1 approval + stale dismissal + required checks.
- Task check 2: PR without approval is blocked from merge.
- Task check 3: Approved PR receives a new commit, previous approval is dismissed automatically.
- Task check 4: PR title that violates Conventional Commits fails governance/pr-title.
- Task check 5: PR with any invalid commit message fails governance/commitlint.
- Task check 6: Squash merge commit message defaults to PR title only.

## Architecture Patterns

Pattern 1: Two-layer governance

- Layer A (platform): GitHub Rulesets enforce branch-level merge and review constraints.
- Layer B (pipeline): GitHub Actions enforce semantic quality gates (PR title + commit messages).
- Why: Rulesets decide if merge is allowed; Actions decide if status checks pass. This cleanly separates repository policy from lint implementation.

Pattern 2: Branch intent contract (Git Flow boundaries)

- main: production-ready history.
- develop: integration branch for upcoming release.
- feature/*: branch from develop, merge back to develop via PR.
- release/*: branch from develop, merge to main, then back-merge to develop.
- hotfix/*: branch from main, merge to main, then sync to develop.

Pattern 3: Audit-friendly merge discipline

- Require PR for main and develop.
- Enforce unique job names for required status checks to avoid ambiguous check mapping.
- Prefer squash merges for integration branches so final history remains classifiable by Conventional Commit headers.

Verification-oriented guidance (convert to tasks):

- Add a governance checklist document that maps each rule to GIT-01, GIT-02, GIT-03.
- Add branch naming examples and allowed merge targets in contributor docs.
- Add a policy test matrix (valid/invalid PR title, valid/invalid commit message, approval/no approval).

## Don't Hand-Roll

Do not build custom scripts for these controls when platform-supported options already exist.

- Do not hand-roll branch access control in CI scripts.
  - Use GitHub Rulesets and required PR/approval rules.
- Do not write custom regex bash scripts as the primary Conventional Commit gate.
  - Use commitlint with @commitlint/config-conventional and explicit type-enum.
- Do not rely only on local git hooks for policy compliance.
  - Use server-side checks in GitHub Actions and required checks in rulesets.
- Do not manually review PR title conformance each time.
  - Use action-semantic-pull-request as an automated required check.

Verification-oriented guidance (convert to tasks):

- Confirm no governance-critical control depends solely on client-local hooks.
- Confirm all merge-blocking policies are visible in repository settings and check runs.

## Common Pitfalls

Pitfall 1: Rules configured but not actually merge-blocking

- Cause: CI jobs exist, but are not selected as required checks in rulesets.
- Prevention: After workflow creation, explicitly bind governance/pr-title and governance/commitlint as required checks.
- Detect early: PR with failing lint still appears mergeable.

Pitfall 2: Ambiguous status checks

- Cause: Reused job names across workflows.
- Prevention: Keep governance job names globally unique.
- Detect early: Required check appears as ambiguous or blocks unexpectedly.

Pitfall 3: Conventional Commits enforced on PR title but not commit list

- Cause: Only semantic PR title check is configured.
- Prevention: Enforce both PR title lint and commitlint for all PR commits.
- Detect early: PR passes title check while containing invalid commits.

Pitfall 4: Git Flow policy not encoded in docs or templates

- Cause: Team knows the model informally, but no repo-level guidance exists.
- Prevention: Add concise branch naming and merge target rules in CONTRIBUTING and PR template.
- Detect early: PRs from wrong base branch (for example, feature branch targeting main).

Pitfall 5: Assuming Git Flow is universally optimal

- Cause: Git Flow applied as dogma in all contexts.
- Prevention: Keep current Phase 1 decision (Git Flow) but document that it is a project policy choice, not a universal default.
- Detect early: Process friction complaints without policy rationale.

## Code Examples

Example 1: commitlint config aligned to Phase 1 type contract

```javascript
// commitlint.config.mjs
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
    ]
  }
};
```

Example 2: PR title Conventional Commit check

```yaml
# .github/workflows/governance-pr-title.yml
name: Governance PR Title

on:
  pull_request_target:
    types: [opened, reopened, edited, synchronize]

permissions:
  pull-requests: read

jobs:
  governance/pr-title:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            docs
            style
            refactor
            perf
            test
            build
            ci
            chore
            revert
```

Example 3: Commit message lint check for PR commits

```yaml
# .github/workflows/governance-commitlint.yml
name: Governance Commit Messages

on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

permissions:
  contents: read
  pull-requests: read

jobs:
  governance/commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: wagoid/commitlint-github-action@v6
        with:
          configFile: commitlint.config.mjs
```

Example 4: Ruleset target patterns and enforcement intent

```text
Target branches: main, develop
Require pull request before merging: ON
Required approvals: 1
Dismiss stale approvals: ON
Require status checks: governance/pr-title, governance/commitlint
Require conversation resolution: ON
Block force pushes: ON
Block deletions: ON
```

## Sources

Critical sources used for prescriptive claims:

- GitHub Docs - Available rules for rulesets:
  - [https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
  - Basis for required PR, required approvals, stale approval dismissal behavior, required status checks, and force-push blocking.
- GitHub Docs - About rulesets:
  - [https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
  - Basis for recommending rulesets over single branch protection rule layering limitations.
- GitHub Docs - About protected branches:
  - [https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
  - Basis for unique status check name caution and review/status-check interactions.
- GitHub Docs - Configuring commit squashing for pull requests:
  - [https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)
  - Basis for squash merge default message behavior and recommendation to default to PR title.
- GitHub Docs - About merge methods on GitHub:
  - [https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github)
  - Basis for merge method behavior and squash merge rationale in governance context.
- Conventional Commits 1.0.0 (official content mirror):
  - [https://github.com/conventional-commits/conventionalcommits.org/blob/master/content/v1.0.0/index.md](https://github.com/conventional-commits/conventionalcommits.org/blob/master/content/v1.0.0/index.md)
  - Basis for commit header grammar and breaking-change notation.
- commitlint docs:
  - Getting started: [https://commitlint.js.org/guides/getting-started.html](https://commitlint.js.org/guides/getting-started.html)
  - CI setup: [https://commitlint.js.org/guides/ci-setup.html](https://commitlint.js.org/guides/ci-setup.html)
  - Basis for commitlint setup and CI linting commands.
- action-semantic-pull-request:
  - [https://github.com/amannn/action-semantic-pull-request](https://github.com/amannn/action-semantic-pull-request)
  - Basis for PR title Conventional Commit enforcement and squash-title workflow compatibility.
- commitlint GitHub Action:
  - [https://github.com/wagoid/commitlint-github-action](https://github.com/wagoid/commitlint-github-action)
  - Basis for PR commit linting implementation in GitHub Actions.
- Git Flow reference model:
  - [https://nvie.com/posts/a-successful-git-branching-model/](https://nvie.com/posts/a-successful-git-branching-model/)
  - Basis for branch role semantics (main/develop/feature/release/hotfix) used in Phase 1 decisions.

Assumptions due missing environment details:

- Repository host is GitHub (supported by phase context and governance target).
- Team will enforce policy through repository settings and Actions (no separate external CI mandated).

Next data needed if assumptions are wrong:

- Actual hosting provider (GitLab/Bitbucket/etc.) to remap rules and workflow syntax.
- Whether branch protection must be managed as code via API/Terraform in this phase.

## Confidence

Overall confidence: MEDIUM-HIGH.

- High confidence:
  - GitHub ruleset capabilities for required PRs, approvals, stale review dismissal, and required status checks.
  - Conventional Commits grammar and breaking-change indicators.
  - commitlint CI setup patterns.
- Medium confidence:
  - Specific third-party action choices (amannn and wagoid) as best fit versus alternatives.
  - Operational fit of strict Git Flow for this team over time (policy is context-valid for this phase, but long-term efficiency may vary).
- Low confidence:
  - None for core Phase 1 governance requirements.

Confidence rationale:

- Critical controls are grounded in official GitHub docs and Conventional Commits/commitlint documentation.
- Some ecosystem tooling recommendations are community-standard rather than platform-native, so they remain medium confidence even with widespread use.
