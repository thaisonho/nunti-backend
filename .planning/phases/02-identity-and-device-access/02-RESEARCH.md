# Phase 2: Identity and Device Access - Research

**Researched:** 2026-03-19
**Domain:** Cognito-backed identity, JWT claim enforcement, and trusted-device authorization on AWS serverless
**Confidence:** MEDIUM-HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Auth flow behavior
- Email verification gating before first successful sign-in is left flexible for planning/research.
- Password policy posture should use Cognito standard/default complexity baseline.
- Failed sign-in responses should favor generic messaging to reduce account-enumeration risk.
- New sign-in on one device should not force sign-out on other existing devices.
- Canonical login identity remains email.
- Verification resend should be available with cooldown messaging.
- Failed-attempt protections should rely on Cognito managed controls (no custom lockout policy in this phase).
- Active device/session visibility should be included at a basic level.
- First successful sign-in on a device should auto-register that device as trusted.
- Display-name collection is not required in this phase.

### Account handle direction (scope-bounded)
- Directionally support account handle/username data for future use.
- Handle policy preference: unique, lowercase, editable with limits.
- User discovery/search by handle is deferred to a future phase and is out of Phase 2 scope.

### Protected-route rejection contract
- Use `401` for missing/invalid token cases; use `403` only when token is valid but lacks permission.
- JWT rejection responses should provide a stable machine-readable error code plus generic human-facing message.
- Expired tokens should return an explicit token-expired machine code to support client re-auth flow.
- Missing-token and malformed-token responses should share the same generic external message.

### Claude's Discretion
- Exact verification-gating behavior (pre-signin hard gate vs restricted verified-state approach).
- Exact response envelope field names for error contract and machine code taxonomy.
- Detailed session/device visibility fields.
- Device revocation interaction specifics not discussed here (must still satisfy AUTH-03 in planning).

### Deferred Ideas (OUT OF SCOPE)
- User discovery/search by username/handle (explicitly deferred; separate future capability).
- Any profile/social identity experience beyond auth/device trust boundaries.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can sign up and sign in with email and password via Cognito. | Cognito API integration pattern, auth endpoints, generic failure messaging, resend-verification handling. |
| AUTH-02 | Backend validates JWT claims (issuer, audience, token_use, expiry) on protected routes. | Verifier strategy with `aws-jwt-verify`, cold-start-safe singleton verifier, claim/error mapping to 401/403. |
| AUTH-03 | User can register multiple devices and revoke a device. | DynamoDB device model, registration/revocation flow options, authorization checks against trusted device state. |
</phase_requirements>

## Summary

Phase 2 should establish the initial runtime backend skeleton for this repository around AWS Lambda + API Gateway HTTP APIs, with Cognito as identity provider and DynamoDB as source of truth for trusted devices. The implementation should keep authentication and authorization concerns explicit and testable: Cognito handles account credential lifecycle, while backend code enforces token claim validity and device trust decisions.

The most important architectural decision is to avoid hand-rolled JWT verification and avoid mixing claim-validation concerns into business handlers. Use a shared auth guard module that verifies `iss`, `aud/client_id`, `token_use`, and `exp` via `aws-jwt-verify`, then maps verifier failures into a stable machine-readable error taxonomy that follows the locked 401/403 policy.

For device access, start with a user-device mapping in DynamoDB keyed by user and device ID, with explicit lifecycle fields (`status`, `revokedAt`, `registeredAt`, `lastSeenAt`). The backend should auto-register the first successful sign-in on a device as trusted (locked decision), support multiple active devices, and enforce revocation checks in protected device-scoped routes.

**Primary recommendation:** Build a Lambda-first TypeScript runtime with centralized JWT verification (`aws-jwt-verify`) and DynamoDB-backed trusted-device records, then enforce 401/403 contracts consistently through one error-mapping layer.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `aws-jwt-verify` | 5.1.1 | Cognito JWT verification (`iss`, `token_use`, `client_id/aud`, `exp`) | AWS-focused verifier with built-in JWKS caching and Cognito-specific claim validation support. |
| `@aws-sdk/client-cognito-identity-provider` | 3.1012.0 | Cognito signup/signin API calls from backend | Official AWS SDK v3 client for Cognito user pools. |
| `@aws-sdk/client-dynamodb` | 3.1012.0 | DynamoDB access for device records | Official AWS SDK v3 DynamoDB client. |
| `@aws-sdk/lib-dynamodb` | 3.1012.0 | Higher-level DynamoDB document APIs | Reduces marshalling boilerplate and keeps repository code readable. |
| `typescript` | 5.9.3 | Type-safe runtime codebase | Strongly typed contracts for auth/device APIs reduce regression risk. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@middy/core` | 7.2.1 | Lambda middleware chain (auth, validation, error shaping) | Use to keep handlers thin and enforce uniform behavior. |
| `zod` | 4.3.6 | Request/response schema validation | Use for auth/device payload validation and machine-readable error details. |
| `vitest` | 4.1.0 | Unit/integration tests | Use for fast auth guard and device service tests. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@middy/core` middleware | Framework routing (Fastify/Express) | Framework is useful if many routes emerge quickly; Middy is leaner for Lambda-native phase start. |
| `aws-jwt-verify` | Generic JOSE/JWT libs | Generic libs are flexible but require more custom Cognito claim wiring and error handling. |
| DynamoDB document client | Raw low-level DynamoDB client only | Low-level client gives full control but adds mapping boilerplate and complexity. |

**Installation:**
```bash
npm install aws-jwt-verify @aws-sdk/client-cognito-identity-provider @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @middy/core zod
npm install -D typescript vitest @types/aws-lambda
```

**Version verification (npm registry):**
- `aws-jwt-verify` 5.1.1 (modified 2025-10-02)
- `@aws-sdk/client-cognito-identity-provider` 3.1012.0 (modified 2026-03-18)
- `@aws-sdk/client-dynamodb` 3.1012.0 (modified 2026-03-18)
- `@aws-sdk/lib-dynamodb` 3.1012.0 (modified 2026-03-18)
- `@middy/core` 7.2.1 (modified 2026-03-19)
- `zod` 4.3.6 (modified 2026-01-25)
- `typescript` 5.9.3 (modified 2026-03-19)
- `vitest` 4.1.0 (modified 2026-03-12)

## Architecture Patterns

### Recommended Project Structure

Suggested initial runtime shape (new files/directories):

```text
src/
  app/
    config.ts                    # env/config parsing
    errors.ts                    # domain/app errors + machine codes
    http-response.ts             # standard response envelope helpers
  auth/
    cognito-client.ts            # CognitoIdentityProviderClient singleton
    cognito-service.ts           # signup/signin/resend-confirmation actions
    jwt-verifier.ts              # CognitoJwtVerifier singleton(s)
    auth-guard.ts                # Authorization header parsing + claim verify
    auth-error-mapper.ts         # verifier errors -> machine codes + 401/403
  devices/
    device-model.ts              # device entity + status transitions
    device-repository.ts         # DynamoDB reads/writes for devices
    device-service.ts            # register/revoke/list business logic
    device-policy.ts             # allow/deny helpers for trusted-device checks
  handlers/http/
    auth-signup.ts               # POST /v1/auth/signup
    auth-signin.ts               # POST /v1/auth/signin
    auth-resend-verification.ts  # POST /v1/auth/resend-verification
    devices-register.ts          # POST /v1/devices/register
    devices-list.ts              # GET /v1/devices
    devices-revoke.ts            # POST /v1/devices/{deviceId}/revoke
    me.ts                        # GET /v1/me (protected claim-validation probe)
  shared/
    logger.ts                    # structured logging facade
    ids.ts                       # ULID/UUID helpers

tests/
  unit/
    auth-guard.test.ts
    auth-error-mapper.test.ts
    device-service.test.ts
  integration/
    protected-route-auth.test.ts
    devices-flow.test.ts
```

### Pattern 1: Auth Boundary Layer (Mandatory)
**What:** Put all JWT extraction, verification, and error normalization in one reusable guard module.
**When to use:** Every protected route.
**Why:** Enforces AUTH-02 consistently and avoids duplicate, divergent security logic.

### Pattern 2: Thin Handler + Service + Repository
**What:**
- Handler: parse input, call service, map output.
- Service: business policy (signup behavior, auto-register trusted device, revoke rules).
- Repository: persistence only.
**When to use:** All auth/device endpoints.
**Why:** Keeps plan tasks independently testable and avoids monolithic Lambda handlers.

### Pattern 3: Single Error Contract Mapper
**What:** One mapper from internal/auth exceptions to `{status, code, message}`.
**When to use:** Across all HTTP handlers.
**Why:** Required by locked machine-readable error requirement and generic user-facing messages.

### Anti-Patterns to Avoid
- **Hand-rolled JWT parsing/crypto checks:** Easy to miss claim and key-rotation edge cases.
- **Per-handler custom error payloads:** Breaks machine-code stability and client reliability.
- **Deleting revoked devices immediately:** Loses auditability and can complicate race-condition handling.
- **Combining auth+device+transport concerns in one module:** Makes AUTH verification and testing brittle.

## Cognito Integration Approach (AUTH-01, AUTH-02)

### Signup/signin
- Use Cognito user pool email+password flow through `@aws-sdk/client-cognito-identity-provider`.
- Keep canonical login identifier as email (locked decision).
- Keep sign-in failure responses generic externally (locked decision) while logging precise reasons internally.
- Support resend verification endpoint with cooldown messaging (locked decision).
- Do not force global sign-out on new device sign-in (locked decision).

### Token validation claims (protected routes)
Use `CognitoJwtVerifier` with explicit expected values:
- `userPoolId` -> derives expected `iss` and JWKS URI.
- `clientId` -> validates `aud` (ID token) or `client_id` (access token).
- `tokenUse` -> enforce expected token type (`access` for API auth unless endpoint specifically needs ID token).
- `exp` -> automatically checked by verifier; map expiration to explicit machine code.

Practical enforcement guidance:
- Instantiate verifier outside handler for JWKS cache reuse across warm invocations.
- Parse `Authorization: Bearer <jwt>` strictly; missing/malformed treated equivalently externally (locked decision).
- Reserve `403` for valid token but insufficient permission/policy only (locked decision + HTTP semantics).

### Error contract recommendation (aligned to locked decisions)

Envelope:
```json
{
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "Authentication failed",
    "requestId": "..."
  }
}
```

Suggested machine code taxonomy:
- `AUTH_TOKEN_MISSING_OR_MALFORMED` -> 401
- `AUTH_TOKEN_EXPIRED` -> 401
- `AUTH_TOKEN_INVALID_CLAIMS` -> 401
- `AUTH_FORBIDDEN` -> 403

Human-facing message policy:
- Missing/malformed token: same generic message (locked).
- Invalid signin credential conditions: generic message (locked).

## API Contract Recommendations

Recommended Phase 2 endpoints:
- `POST /v1/auth/signup`
- `POST /v1/auth/signin`
- `POST /v1/auth/resend-verification`
- `GET /v1/me` (auth verification probe)
- `POST /v1/devices/register`
- `GET /v1/devices`
- `POST /v1/devices/{deviceId}/revoke`

Status policy:
- `200/201` success
- `400` validation errors
- `401` missing/invalid/expired token
- `403` valid token, not permitted (e.g., acting on another user device or policy violation)

Contract design notes:
- Keep error shape identical across handlers.
- Include stable `error.code` always.
- Use generic `message`; put detailed root cause in logs only.

## Device Registration and Revocation (AUTH-03)

### Data model candidates

### Option A (recommended): user-partitioned device items in DynamoDB
- PK: `USER#{userId}`
- SK: `DEVICE#{deviceId}`
- Attributes: `status` (`trusted|revoked`), `createdAt`, `registeredAt`, `revokedAt`, `lastSeenAt`, `deviceLabel`, `platform`, `appVersion`, `revocationReason`.

Pros:
- Fast list-devices by user.
- Easy conditional updates for revoke idempotency.
- Direct support for multi-device requirement.

Cons:
- Requires careful conditional expressions to avoid stale writes.

### Option B: separate tables (`users`, `devices`, `device_events`)
Pros:
- Clearer relational-style boundaries and audit history.
Cons:
- More moving pieces for a no-runtime-starting-point phase; slower to implement.

### Recommended flow
1. Successful sign-in receives valid Cognito tokens.
2. First successful sign-in from a device calls register endpoint automatically and writes trusted device record (locked decision).
3. Protected device-sensitive actions check token + device status.
4. Revoke endpoint sets status `revoked` (soft revoke), sets `revokedAt`, and denies future device-authorized actions.
5. Device list endpoint returns basic active/session visibility fields (locked decision).

### Revocation semantics tradeoffs
- **Soft revoke (recommended):** preserves audit trail, supports support/debug cases.
- **Hard delete:** simpler data footprint but weaker auditability and race-resolution clarity.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT signature + claim validation | Custom JWT parser/crypto verifier | `aws-jwt-verify` | Handles JWKS rotation/cache and Cognito claim differences robustly. |
| Password policy and lockout mechanics | Custom password/rate-limit engine in app | Cognito managed controls | Matches locked decision to rely on Cognito controls this phase. |
| Request schema validation | Ad-hoc manual JSON checks per handler | `zod` schemas | Produces consistent input validation and safer contract evolution. |
| Error envelope consistency | Per-route hand-built response objects | Central error mapper utility | Required for stable machine-readable code taxonomy. |

**Key insight:** The largest risk in this phase is inconsistent auth behavior between routes, not raw feature coding speed; centralizing verification and error mapping removes that risk early.

## Common Pitfalls

### Pitfall 1: Verifying only signature but not expected claims
**What goes wrong:** Token accepted even when wrong app client, wrong token type, or wrong issuer context.
**Why it happens:** Teams rely on generic JWT validation and forget Cognito-specific `token_use`/`client_id` nuances.
**How to avoid:** Require `userPoolId`, `clientId`, and `tokenUse` in verifier config; unit-test claim mismatch cases.
**Warning signs:** Protected route accepts ID token where access token is required.

### Pitfall 2: Divergent 401/403 behavior per endpoint
**What goes wrong:** Client logic breaks because same condition returns different status/code across routes.
**Why it happens:** Endpoint-local auth handling.
**How to avoid:** One shared auth guard + one error mapper, enforced in integration tests.
**Warning signs:** Duplicate auth error literals in multiple handlers.

### Pitfall 3: User enumeration via auth responses
**What goes wrong:** Attackers infer whether account exists from error details or timing.
**Why it happens:** Specific signin/signup failure messages leak state.
**How to avoid:** Generic external messages; detailed internal logs only; rely on Cognito anti-abuse controls (locked).
**Warning signs:** API returns "user not found" or "wrong password" variants.

### Pitfall 4: Device revocation race conditions
**What goes wrong:** Revoked device continues to pass checks briefly due to stale reads or non-atomic updates.
**Why it happens:** Non-conditional writes and inconsistent read paths.
**How to avoid:** Conditional update + centralized device policy check on each protected device-sensitive route.
**Warning signs:** Intermittent post-revocation access in tests.

## Code Examples

Verified patterns from official/library docs and practical implementation:

### Cognito JWT verifier singleton
```typescript
import { CognitoJwtVerifier } from "aws-jwt-verify";

export const accessTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: "access",
  clientId: process.env.COGNITO_APP_CLIENT_ID!,
});
```

### Protected-route auth guard
```typescript
export async function requireAuth(authorizationHeader?: string) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AuthError("AUTH_TOKEN_MISSING_OR_MALFORMED", 401);
  }

  const token = authorizationHeader.slice("Bearer ".length);

  try {
    return await accessTokenVerifier.verify(token);
  } catch (err) {
    if (isExpiredJwtError(err)) {
      throw new AuthError("AUTH_TOKEN_EXPIRED", 401);
    }
    throw new AuthError("AUTH_TOKEN_INVALID_CLAIMS", 401);
  }
}
```

### Device revoke conditional update sketch
```typescript
await ddbDocClient.send(new UpdateCommand({
  TableName: tableName,
  Key: { pk: `USER#${userId}`, sk: `DEVICE#${deviceId}` },
  UpdateExpression: "SET #status = :revoked, revokedAt = :now",
  ConditionExpression: "attribute_exists(pk) AND #status <> :revoked",
  ExpressionAttributeNames: { "#status": "status" },
  ExpressionAttributeValues: {
    ":revoked": "revoked",
    ":now": new Date().toISOString(),
  },
}));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Generic JWT libs with custom Cognito claim logic everywhere | Cognito-aware verifier (`aws-jwt-verify`) | Became de-facto in recent AWS Node stacks | Fewer claim-validation mistakes and better JWKS handling. |
| Route-level ad-hoc auth checks | Central auth boundary middleware/guard | Matured with serverless patterns and middleware ecosystems | Better consistency and testability for 401/403 policy. |
| Hard-delete revoked devices | Soft revocation with explicit status lifecycle | Common in zero-trust/session management designs | Better auditability and incident response support. |

**Deprecated/outdated for this phase:**
- Building custom JWT verification pipeline when Cognito-specific verifier exists.
- Returning highly specific login failure reasons to clients.

## Open Questions

1. **Verification gating strictness before email verification**
   - What we know: lock left this behavior to planner discretion.
   - What is unclear: hard block signin vs allow signin with restricted capabilities.
   - Recommendation: choose one explicit policy and test matrix in PLAN.md to avoid ambiguity.

2. **Device identity fingerprint fields**
   - What we know: first successful sign-in should auto-register trusted device.
   - What is unclear: exact stable device identifier source from clients.
   - Recommendation: define minimum required fields (`deviceId`, `platform`, `appVersion`) and reject missing device ID.

3. **Session/device visibility depth**
   - What we know: basic visibility required this phase.
   - What is unclear: whether to include IP/location metadata now.
   - Recommendation: keep basic fields in scope (`deviceLabel`, `lastSeenAt`, `status`) and defer advanced telemetry.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` (Wave 0 create) |
| Quick run command | `npm run test:auth` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Signup/signin via Cognito with generic failure messaging policy | integration + unit | `npm run test:auth -- tests/integration/auth-signin-signup.test.ts` | ❌ Wave 0 |
| AUTH-02 | Protected-route JWT claim validation and 401/403 mapping | integration + unit | `npm run test:auth -- tests/unit/auth-guard.test.ts tests/integration/protected-route-auth.test.ts` | ❌ Wave 0 |
| AUTH-03 | Register multiple devices and revoke denies further authorization | integration + unit | `npm run test:auth -- tests/unit/device-service.test.ts tests/integration/devices-flow.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:auth`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/auth-guard.test.ts` - claim and token error-path matrix for AUTH-02
- [ ] `tests/unit/auth-error-mapper.test.ts` - stable machine code + status mapping
- [ ] `tests/unit/device-service.test.ts` - register/revoke state transitions for AUTH-03
- [ ] `tests/integration/protected-route-auth.test.ts` - valid vs invalid JWT behavior on protected route
- [ ] `tests/integration/devices-flow.test.ts` - multi-device register/list/revoke end-to-end behavior
- [ ] `vitest.config.ts` - test setup and path aliases
- [ ] Framework install: `npm install -D vitest @types/aws-lambda`

## Risks, Assumptions, and Planner Notes

### Risks
- AWS Cognito docs were partially inaccessible from this environment (HTTP 403), so some behavioral specifics rely on SDK-level patterns and community-accepted practice.
- If token source policy (access vs ID token for APIs) is not locked early, auth checks may diverge.
- Device ID trust quality depends on client-provided identifier guarantees.

### Assumptions
- Runtime stack for Phase 2 is Node.js/TypeScript on AWS Lambda, consistent with `PROJECT.md`.
- API Gateway HTTP API (or equivalent) will front these auth/device endpoints.
- DynamoDB table design can be introduced in this phase for device trust state.

### Planner Notes
- Keep Phase 2 bounded to auth + device trust only; do not add handle discovery/search behavior.
- Include a dedicated plan task for reusable auth guard and error contract before endpoint proliferation.
- Include explicit verification task for success criteria matrix (valid token accepted, invalid claims rejected, revoked device denied).

## Sources

### Primary (HIGH confidence)
- `aws-jwt-verify` README and examples: https://github.com/awslabs/aws-jwt-verify
- Middy documentation (middleware model): https://middy.js.org/docs/
- npm registry version checks executed on 2026-03-19 (`npm view ...`)

### Secondary (MEDIUM confidence)
- MDN HTTP status semantics for 401/403:
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401
  - https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403
- OWASP Authentication Cheat Sheet (generic message and enumeration guidance):
  - https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

### Tertiary (LOW confidence)
- Direct AWS Cognito docs pages were targeted but blocked by HTTP 403 from this environment:
  - https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html
  - https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignUp.html
  - https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html
  - https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RevokeToken.html

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - verified current package versions and well-established AWS ecosystem fit.
- Architecture: MEDIUM-HIGH - strongly aligned to serverless best practice and repository constraints, but no existing runtime code to validate against.
- Pitfalls: MEDIUM-HIGH - backed by OWASP and practical JWT/auth implementation patterns.

**Research date:** 2026-03-19
**Valid until:** 2026-04-18

## Planning Inputs Checklist

- [ ] Confirm strict policy for email-verification gating at signin (hard block vs restricted verified-state).
- [ ] Lock token type policy for protected APIs (`access` only recommended).
- [ ] Approve canonical error envelope shape and machine code set.
- [ ] Approve DynamoDB device model (soft revoke with status lifecycle).
- [ ] Approve initial runtime folder/file skeleton under `src/` and `tests/`.
- [ ] Plan Wave 0 test scaffolding (`vitest.config.ts`, test scripts, baseline auth/device tests).
- [ ] Ensure Phase 2 tasks explicitly satisfy AUTH-01, AUTH-02, AUTH-03 success criteria only.
