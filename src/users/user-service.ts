/**
 * User service — search and lookup operations via Cognito.
 */

import {
  ListUsersCommand,
  AdminGetUserCommand,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider";
import { getCognitoClient } from "../auth/cognito-client.js";
import { getConfig } from "../app/config.js";
import { AppError } from "../app/errors.js";

export interface UserProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
}

export interface SearchUsersInput {
  email: string;
  currentUserId: string; // Exclude current user from results
}

/**
 * Search users by email (exact match only for privacy).
 * Returns empty array if no match found.
 */
export async function searchUsersByEmail(
  input: SearchUsersInput,
): Promise<UserProfile[]> {
  const config = getConfig();
  const client = getCognitoClient();

  try {
    // Use ListUsers with email filter (exact match)
    const result = await client.send(
      new ListUsersCommand({
        UserPoolId: config.cognitoUserPoolId,
        Filter: `email = "${input.email}"`,
        Limit: 10,
      }),
    );

    if (!result.Users || result.Users.length === 0) {
      return [];
    }

    // Map Cognito users to our UserProfile format
    const profiles: UserProfile[] = result.Users
      .filter((user) => {
        // Exclude current user
        const sub = user.Attributes?.find((attr) => attr.Name === "sub")?.Value;
        return sub !== input.currentUserId;
      })
      .map((user) => {
        const attributes = user.Attributes || [];
        const sub = attributes.find((attr) => attr.Name === "sub")?.Value || "";
        const email = attributes.find((attr) => attr.Name === "email")?.Value || "";
        const emailVerified = attributes.find((attr) => attr.Name === "email_verified")?.Value === "true";

        return {
          sub,
          email,
          emailVerified,
        };
      })
      .filter((profile) => profile.sub && profile.email); // Only return valid profiles

    return profiles;
  } catch (error) {
    console.error("Error searching users:", error);
    throw new AppError("USER_SEARCH_FAILED", "Failed to search users", 500);
  }
}

/**
 * Get user profile by sub (user ID).
 */
export async function getUserById(userId: string): Promise<UserProfile | null> {
  const config = getConfig();
  const client = getCognitoClient();

  try {
    const result = await client.send(
      new AdminGetUserCommand({
        UserPoolId: config.cognitoUserPoolId,
        Username: userId,
      }),
    );

    const attributes = result.UserAttributes || [];
    const sub = attributes.find((attr) => attr.Name === "sub")?.Value || userId;
    const email = attributes.find((attr) => attr.Name === "email")?.Value || "";
    const emailVerified = attributes.find((attr) => attr.Name === "email_verified")?.Value === "true";

    return {
      sub,
      email,
      emailVerified,
    };
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      return null;
    }
    console.error("Error getting user by ID:", error);
    throw new AppError("USER_LOOKUP_FAILED", "Failed to lookup user", 500);
  }
}
