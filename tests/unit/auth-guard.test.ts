/**
 * Unit tests for auth-guard.
 *
 * Verifies locked 401/403 rejection semantics:
 * - Missing Authorization header → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Malformed header (no "Bearer " prefix) → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Empty token after "Bearer " → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Expired token → 401 AUTH_TOKEN_EXPIRED
 * - Invalid claims → 401 AUTH_TOKEN_INVALID_CLAIMS
 * - Valid access token → returns user payload with tokenUse=access
 * - Valid ID token → returns user payload with tokenUse=id
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth } from "../../src/auth/auth-guard.js";
import { AuthError } from "../../src/app/errors.js";

// Mock the jwt-verifier module
const mockAccessVerify = vi.fn();
const mockIdVerify = vi.fn();

vi.mock("../../src/auth/jwt-verifier.js", () => ({
  getAccessTokenVerifier: vi.fn(() => ({
    verify: mockAccessVerify,
  })),
  getIdTokenVerifier: vi.fn(() => ({
    verify: mockIdVerify,
  })),
}));

describe("auth-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccessVerify.mockReset();
    mockIdVerify.mockReset();
  });

  describe("missing or malformed token", () => {
    it("rejects missing Authorization header with AUTH_TOKEN_MISSING_OR_MALFORMED", async () => {
      await expect(requireAuth(undefined)).rejects.toMatchObject({
        code: "AUTH_TOKEN_MISSING_OR_MALFORMED",
        statusCode: 401,
      });
    });

    it("rejects null Authorization header with AUTH_TOKEN_MISSING_OR_MALFORMED", async () => {
      await expect(requireAuth(null)).rejects.toMatchObject({
        code: "AUTH_TOKEN_MISSING_OR_MALFORMED",
        statusCode: 401,
      });
    });

    it("rejects empty Authorization header with AUTH_TOKEN_MISSING_OR_MALFORMED", async () => {
      await expect(requireAuth("")).rejects.toMatchObject({
        code: "AUTH_TOKEN_MISSING_OR_MALFORMED",
        statusCode: 401,
      });
    });

    it("rejects header without Bearer prefix with AUTH_TOKEN_MISSING_OR_MALFORMED", async () => {
      await expect(requireAuth("Basic abc123")).rejects.toMatchObject({
        code: "AUTH_TOKEN_MISSING_OR_MALFORMED",
        statusCode: 401,
      });
    });

    it("rejects header with only Bearer (no token) with AUTH_TOKEN_MISSING_OR_MALFORMED", async () => {
      await expect(requireAuth("Bearer ")).rejects.toMatchObject({
        code: "AUTH_TOKEN_MISSING_OR_MALFORMED",
        statusCode: 401,
      });
    });

    it("rejects with Bearer prefix in wrong case with AUTH_TOKEN_MISSING_OR_MALFORMED", async () => {
      await expect(requireAuth("bearer abc123")).rejects.toMatchObject({
        code: "AUTH_TOKEN_MISSING_OR_MALFORMED",
        statusCode: 401,
      });
    });

    it("missing/malformed token returns generic message", async () => {
      try {
        await requireAuth(undefined);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe("Authentication failed");
      }
    });

    it("missing and malformed tokens share same external message", async () => {
      const errors: AuthError[] = [];
      try { await requireAuth(undefined); } catch (e) { errors.push(e as AuthError); }
      try { await requireAuth("Basic xyz"); } catch (e) { errors.push(e as AuthError); }
      try { await requireAuth(""); } catch (e) { errors.push(e as AuthError); }

      // All should have same code and message (locked decision)
      for (const error of errors) {
        expect(error.code).toBe("AUTH_TOKEN_MISSING_OR_MALFORMED");
        expect(error.message).toBe("Authentication failed");
      }
    });
  });

  describe("expired token", () => {
    it("returns AUTH_TOKEN_EXPIRED for expired JWT with 401", async () => {
      mockAccessVerify.mockRejectedValue(new Error("Token expired"));

      await expect(requireAuth("Bearer expired-token")).rejects.toMatchObject({
        code: "AUTH_TOKEN_EXPIRED",
        statusCode: 401,
        message: "Authentication failed",
      });
    });

    it("does not try ID verifier when access token is expired", async () => {
      mockAccessVerify.mockRejectedValue(new Error("Token expired"));

      try {
        await requireAuth("Bearer expired-token");
      } catch {
        // expected
      }

      expect(mockIdVerify).not.toHaveBeenCalled();
    });
  });

  describe("invalid claims", () => {
    it("returns AUTH_TOKEN_INVALID_CLAIMS for invalid signature with 401", async () => {
      mockAccessVerify.mockRejectedValue(new Error("signature validation failed"));
      mockIdVerify.mockRejectedValue(new Error("signature validation failed"));

      await expect(requireAuth("Bearer bad-sig-token")).rejects.toMatchObject({
        code: "AUTH_TOKEN_INVALID_CLAIMS",
        statusCode: 401,
      });
    });

    it("returns AUTH_TOKEN_INVALID_CLAIMS for wrong issuer with 401", async () => {
      mockAccessVerify.mockRejectedValue(new Error("issuer mismatch"));
      mockIdVerify.mockRejectedValue(new Error("issuer mismatch"));

      await expect(requireAuth("Bearer wrong-issuer")).rejects.toMatchObject({
        code: "AUTH_TOKEN_INVALID_CLAIMS",
        statusCode: 401,
      });
    });

    it("returns AUTH_TOKEN_INVALID_CLAIMS for wrong audience with 401", async () => {
      mockAccessVerify.mockRejectedValue(new Error("audience mismatch"));
      mockIdVerify.mockRejectedValue(new Error("audience mismatch"));

      await expect(requireAuth("Bearer wrong-audience")).rejects.toMatchObject({
        code: "AUTH_TOKEN_INVALID_CLAIMS",
        statusCode: 401,
      });
    });

    it("invalid claims errors use generic message", async () => {
      mockAccessVerify.mockRejectedValue(new Error("something wrong"));
      mockIdVerify.mockRejectedValue(new Error("something wrong"));

      try {
        await requireAuth("Bearer bad-token");
      } catch (error) {
        expect((error as AuthError).message).toBe("Authentication failed");
      }
    });
  });

  describe("valid access token", () => {
    it("returns authenticated user for valid access token", async () => {
      mockAccessVerify.mockResolvedValue({
        sub: "user-123",
        email: "user@example.com",
        "cognito:username": "user@example.com",
        token_use: "access",
      });

      const result = await requireAuth("Bearer valid-token");

      expect(result).toEqual({
        sub: "user-123",
        email: "user@example.com",
        username: "user@example.com",
        tokenUse: "access",
      });
    });

    it("returns user without optional fields when not present", async () => {
      mockAccessVerify.mockResolvedValue({
        sub: "user-456",
        token_use: "access",
      });

      const result = await requireAuth("Bearer valid-min-token");

      expect(result.sub).toBe("user-456");
      expect(result.tokenUse).toBe("access");
      expect(result.email).toBeUndefined();
    });
  });

  describe("valid ID token (fallback)", () => {
    it("accepts valid ID token when access verification fails", async () => {
      // Access verifier rejects (wrong token_use), ID verifier accepts
      mockAccessVerify.mockRejectedValue(new Error("token_use claim mismatch"));
      mockIdVerify.mockResolvedValue({
        sub: "user-789",
        email: "user@example.com",
        "cognito:username": "user@example.com",
        token_use: "id",
      });

      const result = await requireAuth("Bearer id-token");

      expect(result).toEqual({
        sub: "user-789",
        email: "user@example.com",
        username: "user@example.com",
        tokenUse: "id",
      });
    });

    it("reports expired for ID token when access fails and ID is expired", async () => {
      mockAccessVerify.mockRejectedValue(new Error("token_use claim mismatch"));
      mockIdVerify.mockRejectedValue(new Error("Token expired"));

      await expect(requireAuth("Bearer expired-id-token")).rejects.toMatchObject({
        code: "AUTH_TOKEN_EXPIRED",
        statusCode: 401,
      });
    });
  });
});
