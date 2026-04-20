# Client Application Development Guide

This comprehensive guide is for frontend and mobile developers integrating with the AWS E2EE Messaging Backend. It covers authentication, device management, messaging flows, error handling, security best practices, and multi-platform implementation examples.

## Table of Contents

1. [Configuration](#1-configuration)
2. [Standard HTTP Response Shape](#2-standard-http-response-shape)
3. [Authentication Flow](#3-authentication-flow)
4. [Device Management](#4-device-management)
5. [HTTP Endpoints Reference](#5-http-endpoints-reference)
6. [WebSocket Integration](#6-websocket-integration)
7. [WebSocket Actions](#7-websocket-actions)
8. [Error Handling Patterns](#8-error-handling-patterns)
9. [Security Best Practices](#9-security-best-practices)
10. [Complete Integration Examples](#10-complete-integration-examples)
11. [Troubleshooting Common Issues](#11-troubleshooting-common-issues)
12. [Testing Your Integration](#12-testing-your-integration)
13. [Performance Best Practices](#13-performance-best-practices)
14. [API Versioning and Migration](#14-api-versioning-and-migration)

---

## 1) Configuration

Set these environment variables in your client app:

| Variable | Example | Notes |
| --- | --- | --- |
| `API_BASE_URL` | `https://w6jsjvl7jc.execute-api.ap-southeast-1.amazonaws.com/production` | HTTP API base URL for REST endpoints |
| `WS_URL` | `wss://tjqh0kr6ba.execute-api.ap-southeast-1.amazonaws.com/production` | WebSocket base URL for realtime messaging |
| `AWS_REGION` | `ap-southeast-1` | Cognito/API region (required for AWS SDK integration) |
| `COGNITO_USER_POOL_ID` | `ap-southeast-1_4JjZBjBlY` | Required for token verification in client libs |
| `COGNITO_APP_CLIENT_ID` | `274al6qrbqf0lp4vyk1ohf0i89` | Required for sign-in flows |

### Configuration Security Notes

**CRITICAL:** Do **not** put Cognito app client secret in the client app. The client secret is only used server-side for backend-to-backend authentication.

**Token Storage:** Store `accessToken`, `refreshToken`, and `idToken` securely:
- **iOS:** Use Keychain Services
- **Android:** Use EncryptedSharedPreferences or Android Keystore
- **Web:** Use httpOnly cookies (if backend supports) or sessionStorage (never localStorage for production)
- **React Native:** Use react-native-keychain or expo-secure-store

**Environment-Specific Configuration:**

```typescript
// Development
const DEV_CONFIG = {
  API_BASE_URL: 'https://dev-api.example.com/dev',
  WS_URL: 'wss://dev-ws.example.com/dev',
  AWS_REGION: 'ap-southeast-1',
  COGNITO_USER_POOL_ID: 'ap-southeast-1_DevPoolId',
  COGNITO_APP_CLIENT_ID: 'dev-client-id'
};

// Staging
const STAGING_CONFIG = {
  API_BASE_URL: 'https://staging-api.example.com/staging',
  WS_URL: 'wss://staging-ws.example.com/staging',
  AWS_REGION: 'ap-southeast-1',
  COGNITO_USER_POOL_ID: 'ap-southeast-1_StagingPoolId',
  COGNITO_APP_CLIENT_ID: 'staging-client-id'
};

// Production
const PROD_CONFIG = {
  API_BASE_URL: 'https://w6jsjvl7jc.execute-api.ap-southeast-1.amazonaws.com/production',
  WS_URL: 'wss://tjqh0kr6ba.execute-api.ap-southeast-1.amazonaws.com/production',
  AWS_REGION: 'ap-southeast-1',
  COGNITO_USER_POOL_ID: 'ap-southeast-1_4JjZBjBlY',
  COGNITO_APP_CLIENT_ID: '274al6qrbqf0lp4vyk1ohf0i89'
};
```

---

## 2) Standard HTTP Response Shape

All HTTP endpoints follow a consistent response structure for both success and error cases.

### Success Response

```json
{
  "data": {
    // Endpoint-specific payload
  },
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

The `requestId` is a unique identifier for the request, useful for debugging and support tickets.

### Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message describing the error",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Meaning | Client Action |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid request payload | Fix request format and retry |
| `UNAUTHORIZED` | 401 | Missing or invalid token | Refresh token or re-authenticate |
| `FORBIDDEN` | 403 | Valid token but insufficient permissions | Check device trust status |
| `NOT_FOUND` | 404 | Resource does not exist | Verify resource ID |
| `CONFLICT` | 409 | Resource already exists | Use existing resource or change identifier |
| `INTERNAL_ERROR` | 500 | Server-side error | Retry with exponential backoff |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | Retry with exponential backoff |

---

## 3) Authentication Flow

### 3.1 Sign Up

Create a new user account with email and password.

**Request:**

```http
POST /v1/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (Success):**

```json
{
  "data": {
    "userId": "user-550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "verified": false
  },
  "requestId": "req-123"
}
```

**Notes:**
- Password must meet Cognito requirements (min 8 chars, uppercase, lowercase, number, special char)
- User receives verification email
- User cannot sign in until email is verified

### 3.2 Resend Verification Email

If the user didn't receive the verification email:

**Request:**

```http
POST /v1/auth/resend-verification
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### 3.3 Sign In

Authenticate with email and password to receive tokens.

**Request:**

```http
POST /v1/auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (Success):**

```json
{
  "data": {
    "accessToken": "eyJraWQiOiJ...",
    "refreshToken": "eyJjdHkiOiJ...",
    "idToken": "eyJraWQiOiJ...",
    "expiresIn": 3600
  },
  "requestId": "req-456"
}
```

**Token Details:**

- `accessToken`: Used for API authentication (expires in 1 hour by default)
- `refreshToken`: Used to obtain new access tokens without re-authentication (expires in 30 days)
- `idToken`: Contains user claims (userId, email, etc.)
- `expiresIn`: Access token lifetime in seconds

**Store these tokens securely** (see Security Best Practices section).

### 3.4 Token Refresh Flow

When the access token expires, use the refresh token to obtain a new one without requiring the user to sign in again.

**Implementation Pattern:**

```typescript
async function refreshAccessToken(refreshToken: string): Promise<string> {
  // Use AWS Amplify or Cognito SDK
  const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  if (!response.ok) {
    // Refresh token expired or invalid - user must sign in again
    throw new Error('REFRESH_FAILED');
  }
  
  const { data } = await response.json();
  return data.accessToken;
}

// Automatic retry with token refresh
async function apiCallWithRetry(url: string, options: RequestInit) {
  let response = await fetch(url, options);
  
  if (response.status === 401) {
    // Token expired - refresh and retry once
    const newToken = await refreshAccessToken(getStoredRefreshToken());
    storeAccessToken(newToken);
    
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${newToken}`
    };
    
    response = await fetch(url, options);
  }
  
  return response;
}
```

### 3.5 Session Management Best Practices

**Token Expiration Handling:**

1. Monitor token expiration proactively (check `expiresIn` value)
2. Refresh token 5 minutes before expiration to avoid race conditions
3. Handle 401 responses gracefully with automatic refresh and retry
4. If refresh fails, redirect user to sign-in screen

**Example with Proactive Refresh:**

```typescript
class TokenManager {
  private accessToken: string;
  private refreshToken: string;
  private expiresAt: number;
  
  async getValidToken(): Promise<string> {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (now >= this.expiresAt - fiveMinutes) {
      await this.refresh();
    }
    
    return this.accessToken;
  }
  
  private async refresh() {
    const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });
    
    if (!response.ok) {
      throw new Error('REFRESH_FAILED');
    }
    
    const { data } = await response.json();
    this.accessToken = data.accessToken;
    this.expiresAt = Date.now() + (data.expiresIn * 1000);
  }
}
```

---

## 4) Device Management

Each physical device (phone, tablet, desktop) must be registered separately to enable end-to-end encryption and device-specific message delivery.

### 4.1 Register Device

Register the current device after sign-in.

**Request:**

```http
POST /v1/devices/register
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "deviceName": "iPhone 15 Pro",
  "deviceType": "ios",
  "publicKey": "base64-encoded-public-key"
}
```

**Response:**

```json
{
  "data": {
    "deviceId": "device-abc123",
    "userId": "user-550e8400",
    "deviceName": "iPhone 15 Pro",
    "trusted": true,
    "registeredAt": "2026-04-20T10:30:00Z"
  },
  "requestId": "req-789"
}
```

**Store the `deviceId`** - you'll need it for all subsequent API calls and WebSocket connections.

### 4.2 List User Devices

Retrieve all devices registered to the current user.

**Request:**

```http
GET /v1/devices
Authorization: Bearer <accessToken>
```

**Response:**

```json
{
  "data": {
    "devices": [
      {
        "deviceId": "device-abc123",
        "deviceName": "iPhone 15 Pro",
        "deviceType": "ios",
        "trusted": true,
        "registeredAt": "2026-04-20T10:30:00Z",
        "lastSeenAt": "2026-04-20T15:45:00Z"
      },
      {
        "deviceId": "device-xyz789",
        "deviceName": "MacBook Pro",
        "deviceType": "web",
        "trusted": true,
        "registeredAt": "2026-04-15T08:00:00Z",
        "lastSeenAt": "2026-04-20T14:20:00Z"
      }
    ]
  },
  "requestId": "req-101"
}
```

### 4.3 Revoke Device

Revoke a device to prevent it from receiving messages (e.g., lost phone, signed out device).

**Request:**

```http
POST /v1/devices/{deviceId}/revoke
Authorization: Bearer <accessToken>
Content-Type: application/json

{}
```

**Response:**

```json
{
  "data": {
    "deviceId": "device-abc123",
    "revoked": true
  },
  "requestId": "req-102"
}
```

**Important:** After revocation, the device cannot send or receive messages until re-registered.

### 4.4 Upload E2EE Key Bundle

Upload the device's end-to-end encryption key bundle for other users to encrypt messages to this device.

**Request:**

```http
PUT /v1/devices/{deviceId}/keys
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
Content-Type: application/json

{
  "identityKey": "base64-encoded-identity-key",
  "signedPreKey": {
    "keyId": 1,
    "publicKey": "base64-encoded-prekey",
    "signature": "base64-encoded-signature"
  },
  "oneTimePreKeys": [
    {
      "keyId": 1,
      "publicKey": "base64-encoded-otpk-1"
    },
    {
      "keyId": 2,
      "publicKey": "base64-encoded-otpk-2"
    }
  ]
}
```

### 4.5 Fetch Target Device Key Bundle

Retrieve another user's device key bundle to encrypt messages for them.

**Request:**

```http
GET /v1/users/{userId}/devices/{deviceId}/bootstrap
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
```

**Response:**

```json
{
  "data": {
    "userId": "user-target",
    "deviceId": "device-target",
    "identityKey": "base64-encoded-identity-key",
    "signedPreKey": {
      "keyId": 1,
      "publicKey": "base64-encoded-prekey",
      "signature": "base64-encoded-signature"
    },
    "oneTimePreKey": {
      "keyId": 5,
      "publicKey": "base64-encoded-otpk-5"
    }
  },
  "requestId": "req-103"
}
```

---

## 5) HTTP Endpoints Reference

Complete reference of all client-facing HTTP endpoints.

| Method | Path | Auth | Headers | Purpose |
| --- | --- | --- | --- | --- |
| `POST` | `/v1/auth/signup` | No | - | Create new user account |
| `POST` | `/v1/auth/signin` | No | - | Sign in and receive tokens |
| `POST` | `/v1/auth/resend-verification` | No | - | Resend email verification |
| `GET` | `/v1/me` | Bearer | `X-Device-Id` | Validate token and device trust |
| `POST` | `/v1/devices/register` | Bearer | - | Register current device |
| `GET` | `/v1/devices` | Bearer | - | List user's devices |
| `POST` | `/v1/devices/{deviceId}/revoke` | Bearer | - | Revoke a device |
| `PUT` | `/v1/devices/{deviceId}/keys` | Bearer | `X-Device-Id` | Upload E2EE key bundle |
| `GET` | `/v1/users/{userId}/devices/{deviceId}/bootstrap` | Bearer | `X-Device-Id` | Fetch target device key bundle |

**Authentication Header Format:**

```
Authorization: Bearer eyJraWQiOiJ...
```

**Device Header Format (when required):**

```
X-Device-Id: device-abc123
```

---

## 6) WebSocket Integration

The WebSocket connection enables realtime bidirectional messaging.

### 6.1 Connection Lifecycle

**1. Connect:**

```
wss://tjqh0kr6ba.execute-api.ap-southeast-1.amazonaws.com/production/?deviceId=<deviceId>
```

**Headers:**

```
Authorization: Bearer <accessToken>
```

**2. Connection Established:**

Server sends no immediate message. Connection is ready for sending/receiving.

**3. Send Actions:**

Send JSON messages with `action` field (see WebSocket Actions section).

**4. Receive Events:**

Server pushes events with `eventType` field.

**5. Heartbeat/Keep-Alive:**

API Gateway WebSocket connections timeout after 10 minutes of inactivity. Implement ping/pong:

```typescript
// Send ping every 5 minutes
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'ping' }));
  }
}, 5 * 60 * 1000);
```

**6. Reconnection:**

On disconnect, reconnect with exponential backoff and send `reconnect` action to replay missed messages.

### 6.2 Connection State Management

```typescript
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private messageQueue: any[] = [];
  
  async connect(url: string, token: string, deviceId: string) {
    this.state = ConnectionState.CONNECTING;
    
    this.ws = new WebSocket(`${url}/?deviceId=${deviceId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    this.ws.onopen = () => {
      this.state = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.flushMessageQueue();
      
      // Send reconnect action to replay missed messages
      if (this.reconnectAttempts > 0) {
        this.send({ action: 'reconnect' });
      }
    };
    
    this.ws.onclose = () => {
      this.state = ConnectionState.DISCONNECTED;
      this.scheduleReconnect();
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };
  }
  
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.state = ConnectionState.FAILED;
      return;
    }
    
    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 60000);
    
    setTimeout(() => {
      this.connect(/* saved connection params */);
    }, delay);
  }
  
  send(message: any) {
    if (this.state === ConnectionState.CONNECTED && this.ws) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for sending after reconnection
      this.messageQueue.push(message);
    }
  }
  
  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      this.send(message);
    }
  }
  
  private handleMessage(message: any) {
    // Handle incoming events based on eventType
    switch (message.eventType) {
      case 'direct-message':
        this.handleDirectMessage(message);
        break;
      case 'delivery-status':
        this.handleDeliveryStatus(message);
        break;
      case 'group-message':
        this.handleGroupMessage(message);
        break;
      case 'error':
        this.handleError(message);
        break;
      default:
        console.warn('Unknown event type:', message.eventType);
    }
  }
}
```

### 6.3 Offline Queue Management

When the device is offline, queue outgoing messages locally and send them when reconnected.

```typescript
interface QueuedMessage {
  id: string;
  message: any;
  timestamp: number;
  attempts: number;
}

class OfflineQueue {
  private queue: QueuedMessage[] = [];
  private maxRetries = 3;
  
  enqueue(message: any) {
    this.queue.push({
      id: message.messageId || message.groupMessageId,
      message,
      timestamp: Date.now(),
      attempts: 0
    });
    this.persistQueue();
  }
  
  async flush(sendFn: (msg: any) => Promise<void>) {
    const messages = [...this.queue];
    this.queue = [];
    
    for (const item of messages) {
      try {
        await sendFn(item.message);
      } catch (error) {
        item.attempts++;
        if (item.attempts < this.maxRetries) {
          this.queue.push(item);
        } else {
          console.error('Message failed after max retries:', item.id);
        }
      }
    }
    
    this.persistQueue();
  }
  
  private persistQueue() {
    // Save to local storage for persistence across app restarts
    localStorage.setItem('messageQueue', JSON.stringify(this.queue));
  }
}
```

---

## 7) WebSocket Actions

Actions are JSON messages sent from the client to the server over the WebSocket connection.

### 7.1 Direct Message

Send:

```json
{
  "action": "sendMessage",
  "messageId": "msg-123",
  "recipientUserId": "user-id",
  "recipientDeviceId": "device-id",
  "ciphertext": "encrypted-payload"
}
```

Possible incoming events:
- `direct-message`
- `delivery-status`
- `error`

### 5.2 Group message

Send:

```json
{
  "action": "groupSend",
  "groupMessageId": "gmsg-123",
  "groupId": "group-abc",
  "ciphertext": "encrypted-payload",
  "attachments": []
}
```

Possible incoming events:
- `group-message`
- `group-device-status`
- `error`

### 5.3 Group membership command

Send:

```json
{
  "action": "group-membership",
  "requestId": "req-123",
  "groupId": "group-abc",
  "changeType": "member-joined",
  "targetUserId": "user-id"
}
```

Allowed `changeType`:
- `member-joined`
- `member-left`
- `member-removed-by-admin`
- `member-role-updated`
- `group-profile-updated`

### 5.4 Reconnect replay

Send:

```json
{
  "action": "reconnect"
}
```

Backlog boundary events you may receive:
- `replay-complete` (direct messages)
- `group-replay-complete` (group messages)

---

## 6) Important client rules

- Always send `X-Device-Id` on protected HTTP endpoints that require device trust.
- In production, do not rely on query-token auth fallback for WebSocket auth.
- Treat WebSocket `eventType: "error"` as operation failure even if socket stays open.
- Keep `messageId` / `groupMessageId` unique per send (idempotency keys).

---

## 7) Quick smoke test (manual)

1. Sign in → get `accessToken`.
2. Register device (if first time).
3. `GET /v1/me` with token + device header (expect `200`).
4. Open WebSocket with token + `deviceId`.
5. Send `sendMessage` to your own user/device for loopback test.
6. Expect:
   - `direct-message`
   - `delivery-status` with `delivered`
