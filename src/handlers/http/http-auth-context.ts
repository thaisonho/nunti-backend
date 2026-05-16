import type { APIGatewayProxyEvent } from 'aws-lambda';
import { requireAuth, type AuthenticatedUser } from '../../auth/auth-guard.js';
import { AppError, AuthError } from '../../app/errors.js';
import * as DeviceService from '../../devices/device-service.js';
import { isDeviceTrusted } from '../../devices/device-policy.js';
import * as AuditService from '../../audit/audit-service.js';

export interface TrustedHttpAuthContext {
  user: AuthenticatedUser;
  deviceId: string;
}

type JwtAuthorizerClaims = Record<string, unknown> & {
  sub?: string;
  email?: string;
  token_use?: string;
  'cognito:username'?: string;
  'cognito:groups'?: string[] | string;
};

function getJwtAuthorizerClaims(
  event: APIGatewayProxyEvent,
): JwtAuthorizerClaims | null {
  const authorizer = (event.requestContext as any)?.authorizer;
  const claims = authorizer?.jwt?.claims ?? authorizer?.claims;

  if (!claims || typeof claims !== 'object' || !claims.sub) {
    return null;
  }

  return claims as JwtAuthorizerClaims;
}

function userFromJwtAuthorizerClaims(
  claims: JwtAuthorizerClaims,
): AuthenticatedUser {
  const groups = Array.isArray(claims['cognito:groups'])
    ? claims['cognito:groups']
    : typeof claims['cognito:groups'] === 'string'
      ? claims['cognito:groups'].split(',').filter(Boolean)
      : [];

  return {
    ...claims,
    sub: claims.sub as string,
    email: claims.email,
    username: claims['cognito:username'],
    tokenUse: claims.token_use ?? 'unknown',
    groups,
    isAdmin: groups.includes('admin'),
  };
}

async function requireHttpAuth(
  event: APIGatewayProxyEvent,
): Promise<AuthenticatedUser> {
  const authorization = event.headers.Authorization || event.headers.authorization;

  try {
    return await requireAuth(authorization);
  } catch (error) {
    const claims = getJwtAuthorizerClaims(event);
    if (claims) {
      return userFromJwtAuthorizerClaims(claims);
    }

    throw error;
  }
}

export async function requireHttpAuthContext(
  event: APIGatewayProxyEvent,
): Promise<AuthenticatedUser> {
  return requireHttpAuth(event);
}

export async function requireTrustedDeviceAuth(
  event: APIGatewayProxyEvent,
): Promise<TrustedHttpAuthContext> {
  const user = await requireHttpAuth(event);

  const deviceId = event.headers['X-Device-Id'] || event.headers['x-device-id'];
  if (!deviceId) {
    throw new AppError('VALIDATION_ERROR', 'Missing X-Device-Id header', 400);
  }

  const devices = await DeviceService.listDevices(user.sub);
  const activeDevice = devices.find((device) => device.deviceId === deviceId);
  if (!activeDevice || !isDeviceTrusted(activeDevice)) {
    AuditService.deviceTrustDenied(
      user.sub,
      deviceId,
      event.requestContext?.identity?.sourceIp,
    );
    throw new AuthError('AUTH_FORBIDDEN', 403);
  }

  return {
    user,
    deviceId,
  };
}
