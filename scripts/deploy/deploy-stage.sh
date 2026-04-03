#!/bin/bash
set -euo pipefail

if [ ! -f "release-manifest.json" ] || [ ! -f "packaged.yaml" ]; then
  echo "Error: release-manifest.json and packaged.yaml must exist."
  exit 1
fi

STACK_NAME=$(jq -r '.StackName' deploy/params.staging.json)
TEMPLATE_PATH=$(jq -r '.templatePath' release-manifest.json)

echo "Deploying to staging..."

OVERRIDES=$(jq -r '.Parameters | to_entries | map("\(.key)=\(.value)") | join(" ")' deploy/params.staging.json)

sam deploy \
  --template-file "$TEMPLATE_PATH" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides $OVERRIDES

echo "Deployed successfully to staging."
