---
status: complete
phase: 03-signal-key-lifecycle-and-bootstrap
source: [03-SUMMARY.md]
started: 2026-03-21T06:06:03Z
updated: 2026-03-21T06:06:57Z
---

## Current Test

[testing complete]

## Tests

### 1. Key Upload Success for Trusted Same-Account Device
expected: |
  Sending PUT /v1/devices/{deviceId}/keys with a valid identityKey and signedPreKey from an authenticated trusted device in the same account returns 200.
  The response contains the target device id and the uploaded key identifiers.
result: pass

### 2. Key Upload Validation and Ownership Guardrails
expected: |
  Sending PUT /v1/devices/{deviceId}/keys with a missing or invalid body returns 400 VALIDATION_ERROR.
  Attempting to upload keys for a device that is not owned/allowed by the caller returns 403 AUTH_FORBIDDEN.
result: pass

### 3. Bootstrap Bundle Retrieval with One-Time Prekey
expected: |
  Sending GET /v1/users/{userId}/devices/{deviceId}/bootstrap for an allowed target returns 200.
  The response includes identityKey, signedPreKey, and exactly one oneTimePreKey for bootstrap.
result: pass

### 4. Bootstrap Exhaustion Conflict Handling
expected: |
  When the target device has no one-time prekeys available, GET /v1/users/{userId}/devices/{deviceId}/bootstrap returns 409 CONFLICT.
result: pass

### 5. Trust-Change Realtime Fanout
expected: |
  When a device is registered, revoked, or has keys updated, active same-account realtime connections receive trust-change events with the correct changeType and deviceId.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps
