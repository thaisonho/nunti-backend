/**
 * Admin guard — requires authenticated user with admin group membership.
 *
 * Uses Cognito User Pool Groups: user must be in the 'admin' group
 * to pass this check. The group membership is encoded in the JWT
 * `cognito:groups` claim.
 *
 * Usage:
 *   const admin = await requireAdmin(event.headers.Authorization);
 *
 * @throws AuthError AUTH_FORBIDDEN (403) if user is not an admin
 */

import { requireAuth, type AuthenticatedUser } from "./auth-guard.js";
import { AuthError } from "../app/errors.js";

/**
 * Require authenticated user with admin group membership.
 *
 * @param authorizationHeader - The raw Authorization header value
 * @returns Verified admin user claims
 * @throws AuthError AUTH_FORBIDDEN if user is not in 'admin' group
 */
export async function requireAdmin(
  authorizationHeader?: string | null,
): Promise<AuthenticatedUser> {
  const user = await requireAuth(authorizationHeader);

  if (!user.isAdmin) {
    throw new AuthError("AUTH_FORBIDDEN", 403);
  }

  return user;
}
