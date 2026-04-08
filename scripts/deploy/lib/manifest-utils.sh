#!/bin/bash
# Shared utilities for release manifest parsing.

read_manifest_field() {
    MANIFEST_PATH="$1" FIELD_NAME="$2" node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, 'utf8'));
const value = manifest[process.env.FIELD_NAME];
if (value === undefined || value === null) {
  process.stderr.write('Missing or null field in manifest: ' + process.env.FIELD_NAME + '\n');
  process.exit(1);
}
process.stdout.write(String(value));
"
}
