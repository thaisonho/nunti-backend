---
phase: 02-identity-and-device-access
plan: 01
subsystem: auth
tags: [cognito, jwt, auth-guard, error-mapping, vitest]
requires: []
provides:
  - Cognito JWT verification singleton with claim validation
  - Centralized auth guard with locked 401/403 semantics
  - Auth error mapper with stable machine code taxonomy
  - Cognito service for signup/signin/resend-verification
  - HTTP handlers for POST /v1/auth/signup, POST /v1/auth/signin, POST /v1/auth/resend-verification
  - Standardized response envelope with error.code, error.message, requestId
affects:
  - Phase 02 plan 02 (device endpoints depend on auth guard + response envelope)
tech-stack:
  added:
    - aws-jwt-verify@5.1.1
    - "@aws-sdk/client-cognito-identity-provider@3.1012.0"
    - "@aws-sdk/client-dynamodb@3.1012.0"
    - "@aws-sdk/lib-dynamodb@3.1012.0"
    - "@middy/core@7.2.1"
    - zod@4.3.6
    - typescript@5.9.3
    - vitest@4.1.0
  patterns:
    - Singleton pattern for JWT verifier and Cognito client (JWKS cache reuse)
    - Centralized error mapper for consistent 401/403 contract
    - Thin handler + service + repository separation
    - Generic external error messaging to prevent enumeration
key-files:
  created:
    - src/app/config.ts
    - src/app/errors.ts
    - src/app/http-response.ts
    - src/auth/jwt-verifier.ts
    - src/auth/auth-error-mapper.ts
    - src/auth/auth-guard.ts
    - src/auth/cognito-client.ts
    - src/auth/cognito-service.ts
    - src/handlers/http/auth-signup.ts
    - src/handlers/http/auth-signin.ts
    - src/handlers/http/auth-resend-verification.ts
    - tests/unit/auth-error-mapper.test.ts
    - tests/unit/auth-guard.test.ts
    - tests/integration/auth-signin-signup.test.ts
    - package.json
    - tsconfig.json
    - vitest.config.ts
  modified: []
key-decisions:
  - description: "Used aws-jwt-verify singleton with explicit claim validation for Cognito access tokens"
    rationale: "Handles JWKS rotation, caching, and Cognito-specific claim semantics without custom code"
  - description: "Generic 'Authentication failed' message for all auth errors including signin failures"
    rationale: "Prevents account enumeration — wrong password and unknown user return identical responses"
  - description: "Resend-verification returns success even for non-existent accounts"
    rationale: "Prevents account existence detection via verification code requests"
  - description: "Zod v4 used for request validation with z.email() and z.string().min()"
    rationale: "Consistent schema validation with machine-readable error messages"
requirements-completed:
  - AUTH-01
  - AUTH-02
duration: 5 min
completed: "2026-03-19"
---

# Phase 02 Plan 01: Wave 0 Runtime Scaffold + Cognito Auth + JWT Claim Enforcement Summary

Runtime scaffold with Cognito auth endpoints, centralized JWT verification, and locked 401/403 machine-code error taxonomy — all proven through 38 passing unit/integration tests.

## Execution

- **Duration:** ~5 min
- **Tasks:** 3 of 3 complete
- **Files:** 17 created, 0 modified
- **Tests:** 38 passed (3 test files)

## Task Results

### Task 0: Wave 0 Runtime Scaffolding
Created TypeScript project skeleton with Vitest, error taxonomy, and HTTP response envelope contract. Added `npm run test:auth` and `npm test` scripts.

### Task 1: JWT Claim Verification + Error Mapping
Implemented `aws-jwt-verify` singleton, auth guard with strict Bearer extraction, and error mapper enforcing locked machine codes: AUTH_TOKEN_MISSING_OR_MALFORMED, AUTH_TOKEN_EXPIRED, AUTH_TOKEN_INVALID_CLAIMS, AUTH_FORBIDDEN. 15 unit tests covering all claim-validation and token error paths.

### Task 2: Cognito Signup/Signin/Resend Handlers
Delivered three HTTP handlers using Cognito service with generic failure messaging. Signup validates email/password via Zod, signin uses USER_PASSWORD_AUTH flow, resend-verification returns fake success for unknown accounts. 12 integration tests covering AUTH-01 endpoint behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check: PASSED
- ✅ All key-files.created exist on disk
- ✅ Git commits present for phase 02-01
- ✅ All 38 tests pass
- ✅ Machine codes verified in src and tests via rg

## Next

Ready for 02-02-PLAN.md — trusted-device lifecycle and protected-route participation.
