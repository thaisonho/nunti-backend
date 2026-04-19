import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import {
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

vi.mock("../../src/auth/cognito-client.js");
vi.mock("../../src/app/config.js");

import { getCognitoClient } from "../../src/auth/cognito-client.js";
import { getConfig } from "../../src/app/config.js";
import {
  resendVerification,
  signIn,
  signUp,
} from "../../src/auth/cognito-service.js";

describe("cognito-service secret hash", () => {
  const send = vi.fn();
  const baseConfig = {
    cognitoUserPoolId: "ap-southeast-1_pool",
    cognitoAppClientId: "client-id-123",
    cognitoRegion: "ap-southeast-1",
    devicesTableName: "devices",
    messagesTableName: "messages",
    stage: "production",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCognitoClient).mockReturnValue({ send } as any);
    vi.mocked(getConfig).mockReturnValue(baseConfig as any);
  });

  it("adds SecretHash for signUp when client secret exists", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      cognitoAppClientSecret: "client-secret",
    } as any);
    send.mockResolvedValueOnce({ UserSub: "sub-1", UserConfirmed: false });

    await signUp({ email: "user@example.com", password: "Password123!" });

    const command = send.mock.calls[0][0] as SignUpCommand;
    const expected = createHmac("sha256", "client-secret")
      .update(`user@example.com${baseConfig.cognitoAppClientId}`)
      .digest("base64");
    expect(command.input.SecretHash).toBe(expected);
  });

  it("adds SECRET_HASH for signIn when client secret exists", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      cognitoAppClientSecret: "client-secret",
    } as any);
    send.mockResolvedValueOnce({
      AuthenticationResult: {
        AccessToken: "access",
        IdToken: "id",
        RefreshToken: "refresh",
        ExpiresIn: 3600,
      },
    });

    await signIn({ email: "user@example.com", password: "Password123!" });

    const command = send.mock.calls[0][0] as InitiateAuthCommand;
    const expected = createHmac("sha256", "client-secret")
      .update(`user@example.com${baseConfig.cognitoAppClientId}`)
      .digest("base64");
    expect(command.input.AuthParameters?.SECRET_HASH).toBe(expected);
  });

  it("adds SecretHash for resendVerification when client secret exists", async () => {
    vi.mocked(getConfig).mockReturnValue({
      ...baseConfig,
      cognitoAppClientSecret: "client-secret",
    } as any);
    send.mockResolvedValueOnce({
      CodeDeliveryDetails: {
        DeliveryMedium: "EMAIL",
        Destination: "u***@example.com",
      },
    });

    await resendVerification({ email: "user@example.com" });

    const command = send.mock.calls[0][0] as ResendConfirmationCodeCommand;
    const expected = createHmac("sha256", "client-secret")
      .update(`user@example.com${baseConfig.cognitoAppClientId}`)
      .digest("base64");
    expect(command.input.SecretHash).toBe(expected);
  });

  it("omits secret hash fields when client secret is not configured", async () => {
    send
      .mockResolvedValueOnce({ UserSub: "sub-1", UserConfirmed: false })
      .mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: "access",
          IdToken: "id",
        },
      })
      .mockResolvedValueOnce({ CodeDeliveryDetails: {} });

    await signUp({ email: "user@example.com", password: "Password123!" });
    await signIn({ email: "user@example.com", password: "Password123!" });
    await resendVerification({ email: "user@example.com" });

    const signUpCommand = send.mock.calls[0][0] as SignUpCommand;
    const signInCommand = send.mock.calls[1][0] as InitiateAuthCommand;
    const resendCommand = send.mock.calls[2][0] as ResendConfirmationCodeCommand;

    expect(signUpCommand.input.SecretHash).toBeUndefined();
    expect(signInCommand.input.AuthParameters?.SECRET_HASH).toBeUndefined();
    expect(resendCommand.input.SecretHash).toBeUndefined();
  });
});
