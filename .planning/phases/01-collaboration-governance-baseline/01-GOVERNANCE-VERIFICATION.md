# Governance Verification Matrix

This matrix outlines the pass/fail scenarios for repository governance and acts as an approval gate reference point.

## Pass/Fail Scenarios

| Scenario | Check / Policy | Expected Outcome | Component / Mechanism |
|---|---|---|---|
| **Approval Gate** | A PR requires at least one external approval | Fails if PR is unapproved, Passes if approved | Branch Rulesets (`.github/rulesets/main.json`, `.github/rulesets/develop.json`) |
| **Stale-Approval Reset** | New commits invalidate previous approvals | Requires re-requesting review and new approval to map to compliance | PR Template checklist + Branch Rulesets |
| **Invalid PR Title** | Title does not comply with Conventional Commits format | `governance/pr-title` workflow action fails and blocks merge | PR title verification action |
| **Invalid Commit Message** | Body/type doesn't match `commitlint.config.mjs` config | `governance/commitlint` workflow fails and blocks merge | Action / Commitlint check |
| **Git Flow Branch Targeting** | Merging features directly to `main` | Fails. PR fails context checks/rejections via branch protection | Branch configurations and Rulesets |

## Execution & Verification

To verify that these governance assets are properly synchronized locally, run:

\`\`\`bash
bash .github/scripts/verify-governance-artifacts.sh
\`\`\`
