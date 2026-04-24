import { requireAuth } from '../../auth/auth-guard.js';
import * as DeviceService from '../../devices/device-service.js';
import { isDeviceTrusted } from '../../devices/device-policy.js';
import { AuthError } from '../../app/errors.js';

interface WebSocketAuthorizerEvent {
  methodArn?: string;
  routeArn?: string;
  headers?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
}

interface WebSocketAuthorizerResult {
  principalId: string;
  policyDocument: {
    Version: '2012-10-17';
    Statement: Array<{
      Action: 'execute-api:Invoke';
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }>;
  };
  context?: {
    userId: string;
    deviceId: string;
  };
}

function isProduction(): boolean {
  return process.env.STAGE === 'production';
}

function policy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: { userId: string; deviceId: string },
): WebSocketAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    ...(context ? { context } : {}),
  };
}

function resolveResourceArn(event: WebSocketAuthorizerEvent): string {
  const arn = event.methodArn ?? event.routeArn;
  if (!arn) return '*';
  
  const parts = arn.split('/');
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}/*`;
  }
  return arn;
}

export const handler = async (
  event: WebSocketAuthorizerEvent,
): Promise<WebSocketAuthorizerResult> => {
  const resourceArn = resolveResourceArn(event);

  try {
    const query = event.queryStringParameters ?? {};
    const headers = event.headers ?? {};

    const authHeader = headers.Authorization ?? headers.authorization ?? null;
    const queryToken = query.token ?? null;

    let bearerValue: string;
    if (authHeader) {
      bearerValue = authHeader;
    } else if (queryToken) {
      if (isProduction()) {
        throw new AuthError('AUTH_TOKEN_MISSING_OR_MALFORMED', 401);
      }
      bearerValue = `Bearer ${queryToken}`;
    } else {
      throw new AuthError('AUTH_TOKEN_MISSING_OR_MALFORMED', 401);
    }

    const user = await requireAuth(bearerValue);

    const deviceId = query.deviceId;
    if (!deviceId || deviceId.length === 0) {
      return policy('anonymous', 'Deny', resourceArn);
    }

    const devices = await DeviceService.listDevices(user.sub);
    const activeDevice = devices.find((device) => device.deviceId === deviceId);
    if (!activeDevice || !isDeviceTrusted(activeDevice)) {
      return policy('anonymous', 'Deny', resourceArn);
    }

    return policy(user.sub, 'Allow', resourceArn, {
      userId: user.sub,
      deviceId,
    });
  } catch {
    return policy('anonymous', 'Deny', resourceArn);
  }
};
