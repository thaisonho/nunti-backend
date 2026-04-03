#!/bin/bash
set -euo pipefail

TARGET_ENVIRONMENT=${1:-""}
RELEASE_VERSION=${2:-""}

if [ -z "$TARGET_ENVIRONMENT" ] || [ -z "$RELEASE_VERSION" ]; then
  echo "Error: targetEnvironment and releaseVersion are required."
  exit 1
fi

PARAMS_FILE="deploy/params.${TARGET_ENVIRONMENT}.json"
if [ ! -f "$PARAMS_FILE" ]; then
  echo "Error: params file $PARAMS_FILE does not exist."
  exit 1
fi

if [ ! -f "release-manifest.json" ]; then
  echo "Error: release-manifest.json for previous approved release must exist."
  exit 1
fi

TEMPLATE_SHA256=$(jq -r '.templateSha256' release-manifest.json)
echo "Executing explicit rollback to previous approved releaseVersion $RELEASE_VERSION (templateSha256: $TEMPLATE_SHA256) on $TARGET_ENVIRONMENT."

TEMPLATE_PATH=$(jq -r '.templatePath' release-manifest.json)
STACK_NAME=$(jq -r '.StackName' "$PARAMS_FILE")
OVERRIDES=$(jq -r '.Parameters | to_entries | map("\(.key)=\(.value)") | join(" ")' "$PARAMS_FILE")

sam deploy \
  --template-file "$TEMPLATE_PATH" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides $OVERRIDES

echo "Rollback completed successfully."
