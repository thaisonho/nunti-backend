#!/usr/bin/env bash
set -eo pipefail

RULESET_FILE="$(dirname "$0")/../governance/rulesets/main-develop-governance.json"
RULESET_NAME=$(jq -r '.name' "$RULESET_FILE")

# Check dependencies
if ! command -v gh &> /dev/null; then
    echo "Error: gh (GitHub CLI) is not installed."
    exit 1
fi
if ! command -v jq &> /dev/null; then
    echo "Error: jq is not installed."
    exit 1
fi

# Ensure user is authenticated
if ! gh auth status &>/dev/null; then
    echo "Error: You are not authenticated with GitHub CLI. Please run 'gh auth login'."
    exit 1
fi

# Determine repo
REPO="${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
if [ -z "$REPO" ]; then
    echo "Error: Could not determine repository. Are you in a git repo with a github remote? Or set REPO env var."
    exit 1
fi

echo "Applying ruleset '$RULESET_NAME' to $REPO..."

# Check if ruleset already exists
EXISTING_ID=$(gh api -X GET "repos/$REPO/rulesets" \
    --jq ".[] | select(.name==\"$RULESET_NAME\") | .id" 2>/dev/null || true)

if [ -n "$EXISTING_ID" ]; then
    echo "Ruleset '$RULESET_NAME' exists with ID: $EXISTING_ID. Updating..."
    gh api -X PUT "repos/$REPO/rulesets/$EXISTING_ID" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        --input "$RULESET_FILE" \
        --silent || { echo "Failed to update ruleset. Ensure you have admin permissions on the repository."; exit 1; }
    echo "Ruleset updated successfully."
else
    echo "Ruleset '$RULESET_NAME' does not exist. Creating..."
    gh api -X POST "repos/$REPO/rulesets" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        --input "$RULESET_FILE" \
        --silent || { echo "Failed to create ruleset. Ensure you have admin permissions on the repository."; exit 1; }
    echo "Ruleset created successfully."
fi
