#!/bin/bash

# Verification script fails when any required governance artifact is missing.
# Script should exit non-zero on failure and print actionable missing-item output.

set -e

MISSING=0

echo "Checking required governance artifacts..."

ARTIFACTS=(
  "commitlint.config.mjs"
  ".github/workflows/governance-pr-title.yml"
  ".github/workflows/governance-commitlint.yml"
  ".github/rulesets/main.json"
  ".github/rulesets/develop.json"
  "CONTRIBUTING.md"
  ".github/pull_request_template.md"
  ".planning/phases/01-collaboration-governance-baseline/01-GOVERNANCE-VERIFICATION.md"
)

for file in "${ARTIFACTS[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing artifact: $file"
    MISSING=1
  else
    echo "✅ Found artifact: $file"
  fi
done

echo "Checking linkages..."

# Verify PR template references branch types from CONTRIBUTING.md
if ! grep -Eq "feature/|release/|hotfix/" ".github/pull_request_template.md"; then
  echo "❌ Linkage failed: .github/pull_request_template.md does not reference branch types 'feature/|release/|hotfix/'"
  MISSING=1
else
  echo "✅ Linkage successful: PR template references branch types."
fi

# Verify VERIFICATION matrix references expected workflow names
if ! grep -q "governance/pr-title" ".planning/phases/01-collaboration-governance-baseline/01-GOVERNANCE-VERIFICATION.md"; then
  echo "❌ Linkage failed: 01-GOVERNANCE-VERIFICATION.md does not reference 'governance/pr-title'"
  MISSING=1
else
  echo "✅ Linkage successful: 01-GOVERNANCE-VERIFICATION.md references 'governance/pr-title'."
fi

if ! grep -q "governance/commitlint" ".planning/phases/01-collaboration-governance-baseline/01-GOVERNANCE-VERIFICATION.md"; then
  echo "❌ Linkage failed: 01-GOVERNANCE-VERIFICATION.md does not reference 'governance/commitlint'"
  MISSING=1
else
  echo "✅ Linkage successful: 01-GOVERNANCE-VERIFICATION.md references 'governance/commitlint'."
fi

if [ $MISSING -eq 1 ]; then
  echo "Governance verification failed. Please correct the missing items or linkages above."
  exit 1
fi

echo "Governance verification passed. All artifacts present and linked."
exit 0
