/**
 * Unit tests for auth-error-mapper.
 *
 * Verifies locked machine code taxonomy:
 * - AUTH_TOKEN_MISSING_OR_MALFORMED → 401
 * - AUTH_TOKEN_EXPIRED → 401
 * - AUTH_TOKEN_INVALID_CLAIMS → 401
 * - AUTH_FORBIDDEN → 403
 *
 * All auth errors produce generic "Authentication failed" message.
 */

import { describe, it, expect } from "vitest";
import {
  isExpiredTokenError,
  mapVerifierError,
  missingOrMalformedTokenError,
  forbiddenError,
  authCodeToStatus,
} from "../../src/auth/auth-error-mapper.js";
import { AuthError } from "../../src/app/errors.js";

describe("auth-error-mapper", () => {
  describe("isExpiredTokenError", () => {
    it("returns true for error messages containing 'expired'", () => {
      expect(isExpiredTokenError(new Error("Token expired"))).toBe(true);
      expect(isExpiredTokenError(new Error("JWT has expired"))).toBe(true);
      expect(isExpiredTokenError(new Error("token is expired"))).toBe(true);
    });

    it("returns false for non-expiration errors", () => {
      expect(isExpiredTokenError(new Error("Invalid signature"))).toBe(false);
      expect(isExpiredTokenError(new Error("Bad token"))).toBe(false);
    });

    it("returns false for non-Error values", () => {
      expect(isExpiredTokenError("expired")).toBe(false);
      expect(isExpiredTokenError(null)).toBe(false);
      expect(isExpiredTokenError(undefined)).toBe(false);
    });
  });

  describe("mapVerifierError", () => {
    it("maps expired token error to AUTH_TOKEN_EXPIRED with 401", () => {
      const result = mapVerifierError(new Error("Token expired"));
      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe("AUTH_TOKEN_EXPIRED");
      expect(result.statusCode).toBe(401);
      expect(result.message).toBe("Authentication failed");
    });

    it("maps other verification errors to AUTH_TOKEN_INVALID_CLAIMS with 401", () => {
      const result = mapVerifierError(new Error("Invalid signature"));
      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe("AUTH_TOKEN_INVALID_CLAIMS");
      expect(result.statusCode).toBe(401);
      expect(result.message).toBe("Authentication failed");
    });

    it("maps unknown non-expiration errors to AUTH_TOKEN_INVALID_CLAIMS", () => {
      const result = mapVerifierError(new Error("Some unknown issue"));
      expect(result.code).toBe("AUTH_TOKEN_INVALID_CLAIMS");
      expect(result.statusCode).toBe(401);
    });
  });

  describe("missingOrMalformedTokenError", () => {
    it("returns AUTH_TOKEN_MISSING_OR_MALFORMED with 401", () => {
      const result = missingOrMalformedTokenError();
      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe("AUTH_TOKEN_MISSING_OR_MALFORMED");
      expect(result.statusCode).toBe(401);
      expect(result.message).toBe("Authentication failed");
    });
  });

  describe("forbiddenError", () => {
    it("returns AUTH_FORBIDDEN with 403", () => {
      const result = forbiddenError();
      expect(result).toBeInstanceOf(AuthError);
      expect(result.code).toBe("AUTH_FORBIDDEN");
      expect(result.statusCode).toBe(403);
      expect(result.message).toBe("Authentication failed");
    });
  });

  describe("authCodeToStatus", () => {
    it("maps AUTH_FORBIDDEN to 403", () => {
      expect(authCodeToStatus("AUTH_FORBIDDEN")).toBe(403);
    });

    it("maps all 401 codes correctly", () => {
      expect(authCodeToStatus("AUTH_TOKEN_MISSING_OR_MALFORMED")).toBe(401);
      expect(authCodeToStatus("AUTH_TOKEN_EXPIRED")).toBe(401);
      expect(authCodeToStatus("AUTH_TOKEN_INVALID_CLAIMS")).toBe(401);
    });
  });

  describe("generic message policy", () => {
    it("all auth errors share identical generic message", () => {
      const errors = [
        missingOrMalformedTokenError(),
        mapVerifierError(new Error("Token expired")),
        mapVerifierError(new Error("Invalid claims")),
        forbiddenError(),
      ];

      for (const error of errors) {
        expect(error.message).toBe("Authentication failed");
      }
    });
  });
});
