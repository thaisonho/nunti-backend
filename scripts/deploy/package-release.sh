#!/bin/bash
set -e

# Package script for AWS SAM deployment
# Requires SAM CLI and AWS CLI
if ! command -v sam &> /dev/null; then
    echo "sam could not be found"
    exit 1
fi

export ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-nunti-artifacts}"
export PKG_PREFIX="${PKG_PREFIX:-staging}"
export RELEASE_VERSION="${RELEASE_VERSION:-$(git describe --tags --always)}"

echo "Packaging release $RELEASE_VERSION..."

npm ci
npm run build

sam build

sam package \
  --s3-bucket "$ARTIFACT_BUCKET" \
  --s3-prefix "$PKG_PREFIX" \
  --output-template-file packaged.yaml

TEMPLATE_SHA256=$(shasum -a 256 packaged.yaml | awk '{ print $1 }')
GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

cat > release-manifest.json <<EOF
{
  "releaseVersion": "$RELEASE_VERSION",
  "gitSha": "$GIT_SHA",
  "templatePath": "packaged.yaml",
  "templateSha256": "$TEMPLATE_SHA256",
  "artifactBucket": "$ARTIFACT_BUCKET",
  "artifactPrefix": "$PKG_PREFIX",
  "packageCommandVersion": "$(sam --version | awk '{print $4}')",
  "builtAt": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF

echo "Packaging complete. Manifest created at release-manifest.json"
