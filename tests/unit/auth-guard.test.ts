/**
 * Unit tests for auth-guard.
 *
 * Verifies locked 401/403 rejection semantics:
 * - Missing Authorization header → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Malformed header (no "Bearer " prefix) → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Empty token after "Bearer " → 401 AUTH_TOKEN_MISSING_OR_MALFORMED
 * - Expired token → 401 AUTH_TOKEN_EXPIRED
 * - Invalid claims → 401 AUTH_TOKEN_INVALID_CLAIMS
 * - Valid token → returns user payload
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth } from "../../src/auth/auth-guard.js";
import { AuthError } from "../../src/app/errors.js";

// Mock the jwt-verifier module
vi.mock("../../src/auth/jwt-verifier.js", () => ({
  getAccessTokenVerifier: vi.fn(() => ({
    verify: vi.fn(),
  })),
}));

import { getAccessTokenVerifier } from "../../src/auth/jwt-verifier.js";

describe("auth-guard", () => {
  let mockVerify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockVerify = vi.fn();
    vi.mocked(getAccessTokenVerifier).mockReturnValue({
      verify: mockVerify,
    } as any);
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
      mockVerify.mockRejectedValue(new Error("Token expired"));

      await expect(requireAuth("Bearer expired-token")).rejects.toMatchObject({
        code: "AUTH_TOKEN_EXPIRED",
        statusCode: 401,
        message: "Authentication failed",
      });
    });
  });

  describe("invalid claims", () => {
    it("returns AUTH_TOKEN_INVALID_CLAIMS for invalid signature with 401", async () => {
      mockVerify.mockRejectedValue(new Error("signature validation failed"));

      await expect(requireAuth("Bearer bad-sig-token")).rejects.toMatchObject({
        code: "AUTH_TOKEN_INVALID_CLAIMS",
        statusCode: 401,
      });
    });

    it("returns AUTH_TOKEN_INVALID_CLAIMS for wrong issuer with 401", async () => {
      mockVerify.mockRejectedValue(new Error("issuer mismatch"));

      await expect(requireAuth("Bearer wrong-issuer")).rejects.toMatchObject({
        code: "AUTH_TOKEN_INVALID_CLAIMS",
        statusCode: 401,
      });
    });

    it("returns AUTH_TOKEN_INVALID_CLAIMS for wrong audience with 401", async () => {
      mockVerify.mockRejectedValue(new Error("audience mismatch"));

      await expect(requireAuth("Bearer wrong-audience")).rejects.toMatchObject({
        code: "AUTH_TOKEN_INVALID_CLAIMS",
        statusCode: 401,
      });
    });

    it("invalid claims errors use generic message", async () => {
      mockVerify.mockRejectedValue(new Error("something wrong"));

      try {
        await requireAuth("Bearer bad-token");
      } catch (error) {
        expect((error as AuthError).message).toBe("Authentication failed");
      }
    });
  });

  describe("valid token", () => {
    it("returns authenticated user for valid token", async () => {
      mockVerify.mockResolvedValue({
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
      mockVerify.mockResolvedValue({
        sub: "user-456",
        token_use: "access",
      });

      const result = await requireAuth("Bearer valid-min-token");

      expect(result.sub).toBe("user-456");
      expect(result.tokenUse).toBe("access");
      expect(result.email).toBeUndefined();
    });
  });
});
