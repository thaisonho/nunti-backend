#!/bin/bash
set -euo pipefail

RELEASE_VERSION=${1:-""}
if [ -z "$RELEASE_VERSION" ]; then
  echo "Error: releaseVersion is required."
  exit 1
fi

if [ ! -f "release-manifest.json" ]; then
  echo "Error: release-manifest.json must exist."
  exit 1
fi

REQUIRED_FIELDS=("releaseVersion" "gitSha" "templatePath" "templateSha256" "artifactBucket" "artifactPrefix")
for field in "${REQUIRED_FIELDS[@]}"; do
  if ! jq -e "has(\"$field\")" release-manifest.json >/dev/null; then
    echo "Error: Manifest is missing required field $field"
    exit 1
  fi
done

MANIFEST_VERSION=$(jq -r '.releaseVersion' release-manifest.json)
if [ "$MANIFEST_VERSION" != "$RELEASE_VERSION" ]; then
  echo "Error: releaseVersion in manifest ($MANIFEST_VERSION) does not match requested ($RELEASE_VERSION)."
  exit 1
fi

TEMPLATE_PATH=$(jq -r '.templatePath' release-manifest.json)
TEMPLATE_SHA256=$(jq -r '.templateSha256' release-manifest.json)
STACK_NAME=$(jq -r '.StackName' deploy/params.production.json)

echo "Promoting releaseVersion $RELEASE_VERSION with templateSha256 $TEMPLATE_SHA256 to production..."
echo "Note: do not rebuild or mutate the artifact."

if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "Error: $TEMPLATE_PATH not found."
  exit 1
fi

OVERRIDES=$(jq -r '.Parameters | to_entries | map("\(.key)=\(.value)") | join(" ")' deploy/params.production.json)

sam deploy \
  --template-file "$TEMPLATE_PATH" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides $OVERRIDES

echo "Successfully promoted to production."
