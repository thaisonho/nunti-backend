#!/bin/bash
set -euo pipefail

RELEASE_VERSION=${GITHUB_REF_NAME:-"local"}
GIT_SHA=${GITHUB_SHA:-$(git rev-parse HEAD)}
ARTIFACT_BUCKET=${SAM_ARTIFACT_BUCKET:-"nunti-sam-artifacts-${AWS_REGION:-ap-southeast-1}"}
ARTIFACT_PREFIX="releases/${RELEASE_VERSION}"

echo "Running packaging process..."
npm ci
npm run build

sam build

sam package \
  --s3-bucket "$ARTIFACT_BUCKET" \
  --s3-prefix "$ARTIFACT_PREFIX" \
  --output-template-file packaged.yaml

TEMPLATE_SHA256=$(sha256sum packaged.yaml | awk '{print $1}')
SAM_VERSION=$(sam --version | grep -o 'SAM CLI, version [0-9.]*' | awk '{print $4}' || echo "unknown")
BUILT_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF > release-manifest.json
{
  "releaseVersion": "${RELEASE_VERSION}",
  "gitSha": "${GIT_SHA}",
  "templatePath": "packaged.yaml",
  "templateSha256": "${TEMPLATE_SHA256}",
  "artifactBucket": "${ARTIFACT_BUCKET}",
  "artifactPrefix": "${ARTIFACT_PREFIX}",
  "packageCommandVersion": "${SAM_VERSION}",
  "builtAt": "${BUILT_AT}"
}
EOF

echo "Packaging complete. Created release-manifest.json."
