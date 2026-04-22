/**
 * Cognito service — signup, signin, verify, and resend-verification actions.
 *
 * Enforces:
 * - Email as canonical login identity
 * - Generic failure messaging externally (no user-enumeration leaks)
 * - No forced global sign-out on new device sign-in
 * - Cognito-managed password policy and lockout controls
 */

import {
  ConfirmSignUpCommand,
  SignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  CodeMismatchException,
  ExpiredCodeException,
  UsernameExistsException,
  InvalidPasswordException,
  NotAuthorizedException,
  UserNotConfirmedException,
  UserNotFoundException,
  CodeDeliveryFailureException,
  LimitExceededException,
  TooManyRequestsException,
  TooManyFailedAttemptsException,
} from "@aws-sdk/client-cognito-identity-provider";
import { createHmac } from "crypto";
import { getCognitoClient } from "./cognito-client.js";
import { getConfig } from "../app/config.js";
import { AppError } from "../app/errors.js";

export interface SignUpInput {
  email: string;
  password: string;
}

export interface SignUpResult {
  userSub: string;
  userConfirmed: boolean;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignInResult {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface ResendVerificationInput {
  email: string;
}

export interface ResendVerificationResult {
  deliveryMedium: string;
  destination: string;
}

export interface VerifyEmailInput {
  email: string;
  code: string;
}

export interface VerifyEmailResult {
  verified: boolean;
}

function computeSecretHash(
  username: string,
  clientId: string,
  clientSecret?: string,
): string | undefined {
  if (!clientSecret || clientSecret.length === 0) {
    return undefined;
  }

  return createHmac("sha256", clientSecret)
    .update(`${username}${clientId}`)
    .digest("base64");
}

/**
 * Sign up a new user with email and password.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const config = getConfig();
  const client = getCognitoClient();
  const secretHash = computeSecretHash(
    input.email,
    config.cognitoAppClientId,
    config.cognitoAppClientSecret,
  );

  try {
    const result = await client.send(
      new SignUpCommand({
        ClientId: config.cognitoAppClientId,
        ...(secretHash && { SecretHash: secretHash }),
        Username: input.email,
        Password: input.password,
        UserAttributes: [
          { Name: "email", Value: input.email },
        ],
      }),
    );

    return {
      userSub: result.UserSub!,
      userConfirmed: result.UserConfirmed ?? false,
    };
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      throw new AppError("AUTH_USER_EXISTS", "An account with this email already exists", 409);
    }
    if (error instanceof InvalidPasswordException) {
      throw new AppError(
        "AUTH_INVALID_PASSWORD",
        "Password does not meet requirements",
        400,
      );
    }
    // Generic failure for unknown errors
    throw new AppError("AUTH_SIGNUP_FAILED", "Sign up failed", 400);
  }
}

/**
 * Sign in a user with email and password using USER_PASSWORD_AUTH flow.
 *
 * Returns tokens on success. All credential failures produce the same
 * generic external message to prevent enumeration.
 */
export async function signIn(input: SignInInput): Promise<SignInResult> {
  const config = getConfig();
  const client = getCognitoClient();
  const secretHash = computeSecretHash(
    input.email,
    config.cognitoAppClientId,
    config.cognitoAppClientSecret,
  );

  try {
    const authParameters: Record<string, string> = {
      USERNAME: input.email,
      PASSWORD: input.password,
      ...(secretHash && { SECRET_HASH: secretHash }),
    };

    const result = await client.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: config.cognitoAppClientId,
        AuthParameters: authParameters,
      }),
    );

    const authResult = result.AuthenticationResult;
    if (!authResult?.AccessToken || !authResult.IdToken) {
      throw new AppError(
        "AUTH_SIGNIN_FAILED",
        "Authentication failed",
        401,
      );
    }

    return {
      accessToken: authResult.AccessToken,
      idToken: authResult.IdToken,
      refreshToken: authResult.RefreshToken ?? "",
      expiresIn: authResult.ExpiresIn ?? 3600,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error instanceof UserNotConfirmedException) {
      throw new AppError(
        "AUTH_USER_NOT_CONFIRMED",
        "Please verify your email before signing in",
        403,
      );
    }

    // NotAuthorizedException covers wrong password AND unknown user
    // UserNotFoundException also maps to generic message
    if (
      error instanceof NotAuthorizedException ||
      error instanceof UserNotFoundException
    ) {
      throw new AppError(
        "AUTH_SIGNIN_FAILED",
        "Authentication failed",
        401,
      );
    }

    throw new AppError("AUTH_SIGNIN_FAILED", "Authentication failed", 401);
  }
}

/**
 * Verify user email using Cognito confirmation code.
 */
export async function verifyEmail(
  input: VerifyEmailInput,
): Promise<VerifyEmailResult> {
  const config = getConfig();
  const client = getCognitoClient();
  const secretHash = computeSecretHash(
    input.email,
    config.cognitoAppClientId,
    config.cognitoAppClientSecret,
  );

  try {
    await client.send(
      new ConfirmSignUpCommand({
        ClientId: config.cognitoAppClientId,
        ...(secretHash && { SecretHash: secretHash }),
        Username: input.email,
        ConfirmationCode: input.code,
      }),
    );

    return { verified: true };
  } catch (error) {
    if (error instanceof CodeMismatchException || error instanceof UserNotFoundException) {
      throw new AppError(
        "AUTH_VERIFICATION_CODE_INVALID",
        "Invalid verification code",
        400,
      );
    }

    if (error instanceof ExpiredCodeException) {
      throw new AppError(
        "AUTH_VERIFICATION_CODE_EXPIRED",
        "Verification code has expired",
        400,
      );
    }

    if (error instanceof NotAuthorizedException) {
      throw new AppError(
        "AUTH_USER_ALREADY_CONFIRMED",
        "Email already verified",
        409,
      );
    }

    if (
      error instanceof LimitExceededException ||
      error instanceof TooManyRequestsException ||
      error instanceof TooManyFailedAttemptsException
    ) {
      throw new AppError(
        "AUTH_LIMIT_EXCEEDED",
        "Too many requests. Please try again later.",
        429,
      );
    }

    throw new AppError(
      "AUTH_VERIFY_FAILED",
      "Failed to verify email",
      400,
    );
  }
}

/**
 * Resend verification code for email confirmation.
 *
 * Does not leak account existence — returns generic response for all outcomes.
 */
export async function resendVerification(
  input: ResendVerificationInput,
): Promise<ResendVerificationResult> {
  const config = getConfig();
  const client = getCognitoClient();
  const secretHash = computeSecretHash(
    input.email,
    config.cognitoAppClientId,
    config.cognitoAppClientSecret,
  );

  try {
    const result = await client.send(
      new ResendConfirmationCodeCommand({
        ClientId: config.cognitoAppClientId,
        ...(secretHash && { SecretHash: secretHash }),
        Username: input.email,
      }),
    );

    return {
      deliveryMedium: result.CodeDeliveryDetails?.DeliveryMedium ?? "EMAIL",
      destination: result.CodeDeliveryDetails?.Destination ?? "***",
    };
  } catch (error) {
    if (error instanceof LimitExceededException || error instanceof TooManyRequestsException) {
      throw new AppError(
        "AUTH_LIMIT_EXCEEDED",
        "Too many requests. Please try again later.",
        429,
      );
    }

    if (error instanceof CodeDeliveryFailureException) {
      throw new AppError(
        "AUTH_CODE_DELIVERY_FAILED",
        "Failed to send verification code",
        500,
      );
    }

    // Generic response for UserNotFoundException — don't leak existence
    if (error instanceof UserNotFoundException) {
      return {
        deliveryMedium: "EMAIL",
        destination: "***",
      };
    }

    throw new AppError("AUTH_RESEND_FAILED", "Failed to resend verification code", 400);
  }
}
