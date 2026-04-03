#!/bin/bash
set -e

TARGET_ENVIRONMENT=$1
RELEASE_VERSION=$2
MANIFEST=${3:-release-manifest.json}

if [ -z "$TARGET_ENVIRONMENT" ]; then
    echo "Error: targetEnvironment (staging or production) is required as the first argument."
    exit 1
fi

if [ -z "$RELEASE_VERSION" ]; then
    echo "Error: releaseVersion is required as the second argument."
    exit 1
fi

if [ ! -f "$MANIFEST" ]; then
    echo "Manifest $MANIFEST not found."
    exit 1
fi

PARAMS_FILE="deploy/params.$TARGET_ENVIRONMENT.json"
if [ ! -f "$PARAMS_FILE" ]; then
    echo "Params file $PARAMS_FILE not found."
    exit 1
fi

MANIFEST_VERSION=$(grep '"releaseVersion"' "$MANIFEST" | awk -F '"' '{print $4}' | tr -d '[:space:]')
TEMPLATE_SHA=$(grep '"templateSha256"' "$MANIFEST" | awk -F '"' '{print $4}' | tr -d '[:space:]')
TEMPLATE_PATH=$(grep '"templatePath"' "$MANIFEST" | awk -F '"' '{print $4}' | tr -d '[:space:]')
GIT_SHA=$(grep '"gitSha"' "$MANIFEST" | awk -F '"' '{print $4}' | tr -d '[:space:]')

if [ "$MANIFEST_VERSION" != "$RELEASE_VERSION" ]; then
    echo "Error: Manifest releaseVersion ($MANIFEST_VERSION) does not match requested rollback version ($RELEASE_VERSION)."
    exit 1
fi

if [ -z "$TEMPLATE_SHA" ]; then
    echo "Error: templateSha256 is missing from manifest."
    exit 1
fi

if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "Error: Template file $TEMPLATE_PATH not found."
    exit 1
fi

CALCULATED_SHA=$(shasum -a 256 "$TEMPLATE_PATH" | awk '{print $1}')
if [ "$CALCULATED_SHA" != "$TEMPLATE_SHA" ]; then
    echo "Error: Template SHA256 mismatch! Expected $TEMPLATE_SHA but got $CALCULATED_SHA."
    exit 1
fi

# Extract parameters from json
PARAMS=$(node -e "
const params = require('./$PARAMS_FILE').Parameters;
const str = Object.keys(params).map(k => k + '=' + params[k]).join(' ');
console.log(str);
")

STACK_NAME=$(node -e "console.log(require('./$PARAMS_FILE').StackName)")

echo "Rolling back $TARGET_ENVIRONMENT to release $RELEASE_VERSION..."

sam deploy \
  --template-file "$TEMPLATE_PATH" \
  --stack-name "$STACK_NAME" \
  --parameter-overrides $PARAMS \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

echo "Rollback complete. Manifest provenance: Git SHA $GIT_SHA, Template SHA256 $TEMPLATE_SHA"
