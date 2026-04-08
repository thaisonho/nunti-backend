#!/bin/bash
set -e

RELEASE_VERSION=$1
MANIFEST=${2:-release-manifest.json}
PARAMS_FILE="deploy/params.production.json"

if [ -z "$RELEASE_VERSION" ]; then
    echo "Error: releaseVersion is required as the first argument."
    exit 1
fi

if [ ! -f "$MANIFEST" ]; then
    echo "Manifest $MANIFEST not found."
    exit 1
fi

if [ ! -f "$PARAMS_FILE" ]; then
    echo "Params file $PARAMS_FILE not found."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/manifest-utils.sh
source "$SCRIPT_DIR/lib/manifest-utils.sh"

MANIFEST_VERSION=$(read_manifest_field "$MANIFEST" "releaseVersion")
TEMPLATE_SHA=$(read_manifest_field "$MANIFEST" "templateSha256")
TEMPLATE_PATH=$(read_manifest_field "$MANIFEST" "templatePath")

MANIFEST_DIR=$(dirname "$MANIFEST")
if [ "${TEMPLATE_PATH#/}" = "$TEMPLATE_PATH" ]; then
    TEMPLATE_FILE="$MANIFEST_DIR/$TEMPLATE_PATH"
else
    TEMPLATE_FILE="$TEMPLATE_PATH"
fi

if [ "$MANIFEST_VERSION" != "$RELEASE_VERSION" ]; then
    echo "Error: Manifest releaseVersion ($MANIFEST_VERSION) does not match requested ($RELEASE_VERSION)."
    exit 1
fi

if [ -z "$TEMPLATE_SHA" ]; then
    echo "Error: templateSha256 is missing from manifest."
    exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "Error: Template file $TEMPLATE_FILE not found."
    exit 1
fi

CALCULATED_SHA=$(shasum -a 256 "$TEMPLATE_FILE" | awk '{print $1}')
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

echo "Promoting release $RELEASE_VERSION to $STACK_NAME using template $TEMPLATE_FILE..."

sam deploy \
    --template-file "$TEMPLATE_FILE" \
  --stack-name "$STACK_NAME" \
  --parameter-overrides $PARAMS \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

echo "Promotion complete."
