/**
 * Integration tests for auth signup/signin flow.
 *
 * Tests AUTH-01 endpoint behavior:
 * - Signup validates input and delegates to Cognito
 * - Signin uses generic error messages for all credential failures
 * - Resend verification is cooldown-aware and doesn't leak account existence
 *
 * Uses mocked Cognito service to verify handler behavior independently.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler as signupHandler } from "../../src/handlers/http/auth-signup.js";
import { handler as signinHandler } from "../../src/handlers/http/auth-signin.js";
import { handler as resendHandler } from "../../src/handlers/http/auth-resend-verification.js";

// Mock the cognito-service module
vi.mock("../../src/auth/cognito-service.js");
vi.mock("../../src/app/config.js", () => ({
  getConfig: vi.fn(() => ({
    cognitoUserPoolId: "test-pool-id",
    cognitoAppClientId: "test-client-id",
    cognitoRegion: "us-east-1",
    devicesTableName: "test-devices",
    stage: "test",
  })),
}));

import * as cognitoService from "../../src/auth/cognito-service.js";
import { AppError } from "../../src/app/errors.js";

function createEvent(body: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: "POST",
    isBase64Encoded: false,
    path: "/v1/auth/signup",
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      requestId: "test-request-id",
    } as any,
    resource: "",
  };
}

describe("auth signup/signin integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /v1/auth/signup", () => {
    it("creates user with valid email and password", async () => {
      vi.mocked(cognitoService.signUp).mockResolvedValue({
        userSub: "sub-123",
        userConfirmed: false,
      });

      const event = createEvent({ email: "user@example.com", password: "StrongP@ss1" });
      const response = await signupHandler(event);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.userSub).toBe("sub-123");
      expect(body.data.userConfirmed).toBe(false);
      expect(body.requestId).toBeDefined();
    });

    it("returns 400 for invalid email", async () => {
      const event = createEvent({ email: "not-an-email", password: "StrongP@ss1" });
      const response = await signupHandler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for short password", async () => {
      const event = createEvent({ email: "user@example.com", password: "short" });
      const response = await signupHandler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 409 for existing user", async () => {
      vi.mocked(cognitoService.signUp).mockRejectedValue(
        new AppError("AUTH_USER_EXISTS", "An account with this email already exists", 409),
      );

      const event = createEvent({ email: "existing@example.com", password: "StrongP@ss1" });
      const response = await signupHandler(event);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("AUTH_USER_EXISTS");
    });

    it("error response includes requestId", async () => {
      const event = createEvent({ email: "bad", password: "x" });
      const response = await signupHandler(event);
      const body = JSON.parse(response.body);
      expect(body.error.requestId).toBeDefined();
    });
  });

  describe("POST /v1/auth/signin", () => {
    it("returns tokens on successful sign-in", async () => {
      vi.mocked(cognitoService.signIn).mockResolvedValue({
        accessToken: "access-token-123",
        idToken: "id-token-123",
        refreshToken: "refresh-token-123",
        expiresIn: 3600,
      });

      const event = createEvent({ email: "user@example.com", password: "StrongP@ss1" });
      const response = await signinHandler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.accessToken).toBe("access-token-123");
      expect(body.data.idToken).toBe("id-token-123");
      expect(body.data.refreshToken).toBe("refresh-token-123");
      expect(body.data.expiresIn).toBe(3600);
    });

    it("returns 401 with generic message for wrong credentials", async () => {
      vi.mocked(cognitoService.signIn).mockRejectedValue(
        new AppError("AUTH_SIGNIN_FAILED", "Authentication failed", 401),
      );

      const event = createEvent({ email: "user@example.com", password: "wrong" });
      const response = await signinHandler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("AUTH_SIGNIN_FAILED");
      expect(body.error.message).toBe("Authentication failed");
    });

    it("returns generic message for unknown user (prevents enumeration)", async () => {
      vi.mocked(cognitoService.signIn).mockRejectedValue(
        new AppError("AUTH_SIGNIN_FAILED", "Authentication failed", 401),
      );

      const event = createEvent({ email: "unknown@example.com", password: "anything" });
      const response = await signinHandler(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      // Same message regardless of whether user exists or not
      expect(body.error.message).toBe("Authentication failed");
    });

    it("returns 400 for invalid input format with generic message", async () => {
      const event = createEvent({ email: "not-email", password: "" });
      const response = await signinHandler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      // Generic message — does not reveal which field is wrong
      expect(body.error.message).toBe("Invalid credentials format");
    });
  });

  describe("POST /v1/auth/resend-verification", () => {
    it("returns success for valid email", async () => {
      vi.mocked(cognitoService.resendVerification).mockResolvedValue({
        deliveryMedium: "EMAIL",
        destination: "u***@example.com",
      });

      const event = createEvent({ email: "user@example.com" });
      const response = await resendHandler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.message).toContain("If an account exists");
    });

    it("returns 400 for invalid email format", async () => {
      const event = createEvent({ email: "not-email" });
      const response = await resendHandler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 429 for rate limiting", async () => {
      vi.mocked(cognitoService.resendVerification).mockRejectedValue(
        new AppError("AUTH_LIMIT_EXCEEDED", "Too many requests. Please try again later.", 429),
      );

      const event = createEvent({ email: "user@example.com" });
      const response = await resendHandler(event);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("AUTH_LIMIT_EXCEEDED");
    });
  });
});
