#!/bin/bash
set -e

# Deploy script for AWS SAM using release manifest
MANIFEST="release-manifest.json"
PARAMS_FILE="deploy/params.staging.json"

if [ ! -f "$MANIFEST" ]; then
    echo "Manifest $MANIFEST not found. Run package-release.sh first."
    exit 1
fi

if [ ! -f "$PARAMS_FILE" ]; then
    echo "Params file $PARAMS_FILE not found."
    exit 1
fi

TEMPLATE_PATH=$(grep '"templatePath"' "$MANIFEST" | awk -F '"' '{print $4}')

# Extract parameters from json
PARAMS=$(node -e "
const params = require('./$PARAMS_FILE').Parameters;
const str = Object.keys(params).map(k => k + '=' + params[k]).join(' ');
console.log(str);
")

STACK_NAME=$(node -e "console.log(require('./$PARAMS_FILE').StackName)")

echo "Deploying $STACK_NAME from $TEMPLATE_PATH..."

sam deploy \
  --template-file "$TEMPLATE_PATH" \
  --stack-name "$STACK_NAME" \
  --parameter-overrides $PARAMS \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

echo "Deployment complete."
