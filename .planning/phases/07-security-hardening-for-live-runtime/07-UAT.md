---
status: testing
phase: 07-security-hardening-for-live-runtime
source: .planning/phases/07-security-hardening-for-live-runtime/07-01-SUMMARY.md, .planning/phases/07-security-hardening-for-live-runtime/07-02-SUMMARY.md
started: 2026-04-09T04:24:00Z
updated: 2026-04-09T04:24:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. HTTP auth accepts access token
expected: Call a protected HTTP endpoint with a valid access token. The request succeeds (not 401) and returns protected payload.
result: pass

### 2. HTTP auth accepts ID token fallback
expected: Call the same protected HTTP endpoint with a valid ID token (without access token). The request still succeeds due to verifier fallback.
result: pass

### 3. Invalid or expired token is rejected
expected: Call a protected HTTP endpoint with invalid or expired JWT. The request is denied with auth error and no protected data leaks.
result: pass

### 4. WebSocket auth in production requires Authorization header
expected: In production mode, connect to WebSocket using only query token. Connection is rejected; using Authorization header succeeds.
result: pass

### 5. Secret resolution fails closed when secret missing
expected: Run with missing or inaccessible secret. Runtime config initialization fails explicitly rather than silently using insecure defaults.
result: pass

### 6. Realtime warning logs redact sensitive identifiers
expected: Trigger a realtime warning path and inspect logs. Raw user/device identifiers are not logged; only deterministic redacted hashes appear.
result: pass

### 7. Release promotion uses production-specific OIDC role
expected: Promotion path resolves production role credential source (AWS_OIDC_ROLE_ARN_PROD) and does not reuse staging role.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
