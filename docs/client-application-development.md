# Client Application Development Guide (Simple)

This guide is for frontend/mobile developers integrating with this backend.

## 1) What to configure in the client

Set these environment variables in your client app:

| Variable | Example | Notes |
| --- | --- | --- |
| `API_BASE_URL` | `https://w6jsjvl7jc.execute-api.ap-southeast-1.amazonaws.com/production` | HTTP API base URL |
| `WS_URL` | `wss://tjqh0kr6ba.execute-api.ap-southeast-1.amazonaws.com/production` | WebSocket base URL |
| `AWS_REGION` | `ap-southeast-1` | Cognito/API region |
| `COGNITO_USER_POOL_ID` | `ap-southeast-1_4JjZBjBlY` | Required for token verification in client libs |
| `COGNITO_APP_CLIENT_ID` | `274al6qrbqf0lp4vyk1ohf0i89` | Required for sign-in flows |

Do **not** put Cognito app client secret in the client app.

---

## 2) Standard HTTP response shape

Success:

```json
{
  "data": {},
  "requestId": "uuid"
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human readable message",
    "requestId": "uuid"
  }
}
```

---

## 3) Minimum working client flow

1. `POST /v1/auth/signup` with email/password.
2. `POST /v1/auth/verify-email` with email + 6-digit code from Cognito email.
3. `POST /v1/auth/signin` with email/password.
4. Save `accessToken` (and refresh token if used by your app).
5. `POST /v1/devices/register` once per device.
6. For protected HTTP routes, send:
   - `Authorization: Bearer <accessToken>`
   - `X-Device-Id: <deviceId>`
7. Open WebSocket with:
   - URL: `wss://.../production/?deviceId=<deviceId>`
   - Header: `Authorization: Bearer <accessToken>` (or lowercase `authorization`)
8. Send WS actions (`sendMessage`, `groupSend`, etc.).
9. On reconnect, send `{"action":"reconnect"}` to replay queued events.

---

## 4) HTTP endpoints used by client

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/signup` | No | Create account |
| `POST` | `/v1/auth/verify-email` | No | Verify signup email with 6-digit code |
| `POST` | `/v1/auth/signin` | No | Sign in, get tokens |
| `POST` | `/v1/auth/resend-verification` | No | Resend email verification |
| `GET` | `/v1/me` | Bearer + `X-Device-Id` | Validate token and trusted device |
| `POST` | `/v1/devices/register` | Bearer | Register current device |
| `GET` | `/v1/devices` | Bearer | List own devices |
| `POST` | `/v1/devices/{deviceId}/revoke` | Bearer | Revoke a device |
| `PUT` | `/v1/devices/{deviceId}/keys` | Bearer + `X-Device-Id` | Upload E2EE key bundle |
| `GET` | `/v1/users/{userId}/devices` | Bearer | List another user's devices (for E2EE session setup) |
| `GET` | `/v1/users/{userId}/devices/{deviceId}/bootstrap` | Bearer + `X-Device-Id` | Fetch target device key bundle |
| `GET` | `/v1/users/search` | Bearer + `X-Device-Id` | Search users by email |
| `POST` | `/v1/groups` | Bearer + `X-Device-Id` | Create a group and optionally add initial members |
| `GET` | `/v1/groups/{groupId}` | Bearer + `X-Device-Id` | Get group metadata and full member list |
| `GET` | `/v1/groups/{groupId}/members` | Bearer + `X-Device-Id` | List group members |
| `POST` | `/v1/groups/{groupId}/members` | Bearer + `X-Device-Id` | Add a member to a group |
| `DELETE` | `/v1/groups/{groupId}/members/{userId}` | Bearer + `X-Device-Id` | Remove a member (admin/owner action) |
| `POST` | `/v1/groups/{groupId}/leave` | Bearer + `X-Device-Id` | Leave a group as current user |

### 4.1 Authentication Endpoints (Detailed)

#### POST /v1/auth/signup

Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (200):**
```json
{
  "data": {
    "userSub": "cognito-user-sub-uuid",
    "userConfirmed": false
  },
  "requestId": "req-uuid"
}
```

**Error Responses:**
- `409 AUTH_USER_EXISTS` - Email already registered
- `400 AUTH_INVALID_PASSWORD` - Password doesn't meet requirements (min 12 chars, uppercase, lowercase, numbers, symbols)
- `400 AUTH_SIGNUP_FAILED` - Generic signup failure

**Password Requirements:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one symbol

---

#### POST /v1/auth/verify-email

Verify user email with 6-digit code sent by Cognito.

**Request:**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**Validation Rules:**
- `email`: Must be valid email format
- `code`: Must be exactly 6 digits (numeric only)

**Success Response (200):**
```json
{
  "message": "Email verified successfully",
  "verified": true
}
```

**Error Responses:**
- `400 VALIDATION_ERROR` - Invalid email format or code format
- `400 AUTH_VERIFICATION_CODE_INVALID` - Wrong verification code or user not found
- `400 AUTH_VERIFICATION_CODE_EXPIRED` - Code has expired (codes expire after 24 hours)
- `409 AUTH_USER_ALREADY_CONFIRMED` - Email already verified
- `429 AUTH_LIMIT_EXCEEDED` - Too many verification attempts

**Notes:**
- Verification codes expire after 24 hours
- Maximum 3 failed attempts before temporary lockout
- Use `/v1/auth/resend-verification` to get a new code

---

#### POST /v1/auth/signin

Sign in with email and password to get authentication tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Success Response (200):**
```json
{
  "data": {
    "accessToken": "eyJraWQiOiJ...",
    "idToken": "eyJraWQiOiJ...",
    "refreshToken": "eyJjdHkiOiJ...",
    "expiresIn": 3600
  },
  "requestId": "req-uuid"
}
```

**Token Details:**
- `accessToken`: Use for API authorization (expires in 1 hour)
- `idToken`: Contains user claims (expires in 1 hour)
- `refreshToken`: Use to get new tokens (expires in 30 days)
- `expiresIn`: Access token lifetime in seconds

**Error Responses:**
- `401 AUTH_SIGNIN_FAILED` - Invalid credentials (generic message to prevent user enumeration)
- `403 AUTH_USER_NOT_CONFIRMED` - Email not verified yet
- `401 AUTH_SIGNIN_FAILED` - User not found (same generic message)

**Security Notes:**
- All credential failures return the same generic message to prevent account enumeration
- No indication whether email exists or password is wrong
- Account lockout after multiple failed attempts (managed by Cognito)

---

#### POST /v1/auth/resend-verification

Resend email verification code.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "data": {
    "deliveryMedium": "EMAIL",
    "destination": "u***@example.com"
  },
  "requestId": "req-uuid"
}
```

**Error Responses:**
- `429 AUTH_LIMIT_EXCEEDED` - Too many resend requests
- `500 AUTH_CODE_DELIVERY_FAILED` - Failed to send email
- `400 AUTH_RESEND_FAILED` - Generic failure

**Security Notes:**
- Returns success even if email doesn't exist (prevents user enumeration)
- Rate limited to prevent abuse
- Destination email is masked in response

---

### 4.2 Device Management Endpoints (Detailed)

#### POST /v1/devices/register

Register a new device for the authenticated user.

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Request:**
```json
{
  "deviceId": "device-uuid-generated-by-client",
  "deviceName": "iPhone 14 Pro",
  "platform": "ios"
}
```

**Success Response (200):**
```json
{
  "data": {
    "deviceId": "device-uuid",
    "userId": "user-sub",
    "deviceName": "iPhone 14 Pro",
    "platform": "ios",
    "registeredAt": "2026-04-22T18:00:00Z"
  },
  "requestId": "req-uuid"
}
```

**Notes:**
- Generate `deviceId` on client side (UUID v4 recommended)
- Each device must be registered before sending messages
- Device registration is required for E2EE key exchange

---

#### GET /v1/me

Validate access token and check if device is trusted.

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
```

**Success Response (200):**
```json
{
  "data": {
    "userId": "user-sub",
    "email": "user@example.com",
    "deviceTrusted": true
  },
  "requestId": "req-uuid"
}
```

**Error Responses:**
- `401 UNAUTHORIZED` - Invalid or expired token
- `403 DEVICE_NOT_TRUSTED` - Device not registered

---

### 4.3 Group Management Endpoints (Detailed)

#### POST /v1/groups

Create a new group and optionally add initial members.

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
```

**Request:**
```json
{
  "groupName": "Team Alpha",
  "memberUserIds": ["user-2", "user-3"]
}
```

**Success Response (200):**
```json
{
  "data": {
    "groupId": "group-uuid",
    "groupName": "Team Alpha",
    "createdBy": "user-sub",
    "createdAt": "2026-04-22T18:00:00Z",
    "members": [
      {
        "userId": "user-sub",
        "role": "owner"
      },
      {
        "userId": "user-2",
        "role": "member"
      },
      {
        "userId": "user-3",
        "role": "member"
      }
    ]
  },
  "requestId": "req-uuid"
}
```

**Notes:**
- Creator is automatically added as owner
- `memberUserIds` is optional (can create empty group)
- Group name is required

---

#### GET /v1/groups/{groupId}

Get group metadata and full member list.

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
```

**Success Response (200):**
```json
{
  "data": {
    "groupId": "group-uuid",
    "groupName": "Team Alpha",
    "createdBy": "user-sub",
    "createdAt": "2026-04-22T18:00:00Z",
    "members": [
      {
        "userId": "user-sub",
        "role": "owner",
        "joinedAt": "2026-04-22T18:00:00Z"
      },
      {
        "userId": "user-2",
        "role": "member",
        "joinedAt": "2026-04-22T18:01:00Z"
      }
    ]
  },
  "requestId": "req-uuid"
}
```

**Error Responses:**
- `404 GROUP_NOT_FOUND` - Group doesn't exist
- `403 NOT_GROUP_MEMBER` - User not in group

---

#### POST /v1/groups/{groupId}/members

Add a member to a group.

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
```

**Request:**
```json
{
  "userId": "user-4"
}
```

**Success Response (200):**
```json
{
  "data": {
    "groupId": "group-uuid",
    "userId": "user-4",
    "role": "member",
    "addedBy": "user-sub",
    "addedAt": "2026-04-22T18:05:00Z"
  },
  "requestId": "req-uuid"
}
```

**Error Responses:**
- `404 GROUP_NOT_FOUND` - Group doesn't exist
- `403 INSUFFICIENT_PERMISSIONS` - Only admins/owners can add members
- `409 ALREADY_MEMBER` - User already in group

---

#### DELETE /v1/groups/{groupId}/members/{userId}

Remove a member from a group (admin/owner only).

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
```

**Success Response (200):**
```json
{
  "data": {
    "groupId": "group-uuid",
    "userId": "user-4",
    "removedBy": "user-sub",
    "removedAt": "2026-04-22T18:10:00Z"
  },
  "requestId": "req-uuid"
}
```

**Error Responses:**
- `404 GROUP_NOT_FOUND` - Group doesn't exist
- `403 INSUFFICIENT_PERMISSIONS` - Only admins/owners can remove members
- `400 CANNOT_REMOVE_OWNER` - Cannot remove group owner

---

#### POST /v1/groups/{groupId}/leave

Leave a group as the current user.

**Headers:**
```
Authorization: Bearer <accessToken>
X-Device-Id: <deviceId>
```

**Request:**
```json
POST /v1/groups/group-abc/leave
```

**Success Response (200):**
```json
{
  "data": {
    "groupId": "group-uuid",
    "userId": "user-sub",
    "leftAt": "2026-04-22T18:15:00Z"
  },
  "requestId": "req-uuid"
}
```

**Error Responses:**
- `404 GROUP_NOT_FOUND` - Group doesn't exist
- `403 NOT_GROUP_MEMBER` - User not in group
- `400 OWNER_CANNOT_LEAVE` - Owner must transfer ownership first

---

## 5) WebSocket actions to send from client

### 5.1 Connection Setup

**WebSocket URL:**
```
wss://<ws-endpoint>/production/?deviceId=<deviceId>
```

**Connection Headers:**
```
Authorization: Bearer <accessToken>
```

**Connection Flow:**
1. Establish WebSocket connection with URL and headers
2. Wait for connection confirmation
3. Send actions as JSON messages
4. Listen for incoming events

**Connection Error Responses:**
- `401 Unauthorized` - Invalid or expired token
- `403 Forbidden` - Device not registered or not trusted

---

### 5.2 Direct Message (sendMessage)

Send a direct encrypted message to a specific user's device.

**Send:**
```json
{
  "action": "sendMessage",
  "messageId": "msg-uuid-123",
  "recipientUserId": "user-sub-456",
  "recipientDeviceId": "device-uuid-789",
  "ciphertext": "base64-encrypted-payload"
}
```

**Field Requirements:**
- `messageId`: Unique UUID (client-generated, used for idempotency)
- `recipientUserId`: Target user's Cognito sub
- `recipientDeviceId`: Target device UUID
- `ciphertext`: E2EE encrypted message payload (base64 encoded)

**Incoming Events:**

**Success - Message Delivered:**
```json
{
  "eventType": "direct-message",
  "messageId": "msg-uuid-123",
  "senderUserId": "user-sub-123",
  "senderDeviceId": "device-uuid-456",
  "ciphertext": "base64-encrypted-payload",
  "timestamp": "2026-04-22T18:00:00Z"
}
```

**Delivery Status:**
```json
{
  "eventType": "delivery-status",
  "messageId": "msg-uuid-123",
  "status": "delivered",
  "timestamp": "2026-04-22T18:00:01Z"
}
```

**Error:**
```json
{
  "eventType": "error",
  "messageId": "msg-uuid-123",
  "errorCode": "RECIPIENT_OFFLINE",
  "message": "Recipient device is offline, message queued"
}
```

**Possible Error Codes:**
- `RECIPIENT_OFFLINE` - Message queued for delivery
- `INVALID_RECIPIENT` - User or device doesn't exist
- `ENCRYPTION_ERROR` - Ciphertext validation failed

---

### 5.3 Group Message (groupSend)

Send an encrypted message to all members of a group.

**Send:**
```json
{
  "action": "groupSend",
  "groupMessageId": "gmsg-uuid-123",
  "groupId": "group-uuid-456",
  "ciphertext": "base64-encrypted-payload",
  "attachments": []
}
```

**Field Requirements:**
- `groupMessageId`: Unique UUID (client-generated)
- `groupId`: Target group UUID
- `ciphertext`: E2EE encrypted message (encrypted per-device)
- `attachments`: Array of attachment metadata (optional)

**Incoming Events:**

**Group Message Received:**
```json
{
  "eventType": "group-message",
  "groupMessageId": "gmsg-uuid-123",
  "groupId": "group-uuid-456",
  "senderUserId": "user-sub-123",
  "senderDeviceId": "device-uuid-789",
  "ciphertext": "base64-encrypted-payload",
  "timestamp": "2026-04-22T18:00:00Z"
}
```

**Device Delivery Status:**
```json
{
  "eventType": "group-device-status",
  "groupMessageId": "gmsg-uuid-123",
  "groupId": "group-uuid-456",
  "deviceStatuses": [
    {
      "userId": "user-sub-456",
      "deviceId": "device-uuid-111",
      "status": "delivered"
    },
    {
      "userId": "user-sub-789",
      "deviceId": "device-uuid-222",
      "status": "queued"
    }
  ]
}
```

**Error:**
```json
{
  "eventType": "error",
  "groupMessageId": "gmsg-uuid-123",
  "errorCode": "NOT_GROUP_MEMBER",
  "message": "You are not a member of this group"
}
```

**Possible Error Codes:**
- `NOT_GROUP_MEMBER` - Sender not in group
- `GROUP_NOT_FOUND` - Group doesn't exist
- `ENCRYPTION_ERROR` - Invalid ciphertext

---

### 5.4 Group Membership Command (group-membership)

Notify group members of membership changes.

**Send:**
```json
{
  "action": "group-membership",
  "requestId": "req-uuid-123",
  "groupId": "group-uuid-456",
  "changeType": "member-joined",
  "targetUserId": "user-sub-789"
}
```

**Field Requirements:**
- `requestId`: Unique UUID for this request
- `groupId`: Target group UUID
- `changeType`: Type of membership change
- `targetUserId`: User affected by the change

**Allowed changeType Values:**
- `member-joined` - New member added to group
- `member-left` - Member voluntarily left group
- `member-removed-by-admin` - Member removed by admin/owner
- `member-role-updated` - Member role changed (admin/member)
- `group-profile-updated` - Group name or metadata changed

**Incoming Event:**
```json
{
  "eventType": "group-membership-change",
  "groupId": "group-uuid-456",
  "changeType": "member-joined",
  "targetUserId": "user-sub-789",
  "actorUserId": "user-sub-123",
  "timestamp": "2026-04-22T18:00:00Z"
}
```

---

### 5.5 Reconnect Replay (reconnect)

Request replay of queued messages after reconnection.

**Send:**
```json
{
  "action": "reconnect"
}
```

**Purpose:**
- Retrieve messages that arrived while offline
- Sync message state after connection drop
- Get delivery status updates

**Incoming Events:**

**Direct Messages Replay:**
```json
{
  "eventType": "direct-message",
  "messageId": "msg-uuid-123",
  "senderUserId": "user-sub-456",
  "senderDeviceId": "device-uuid-789",
  "ciphertext": "base64-encrypted-payload",
  "timestamp": "2026-04-22T17:55:00Z",
  "queued": true
}
```

**Group Messages Replay:**
```json
{
  "eventType": "group-message",
  "groupMessageId": "gmsg-uuid-456",
  "groupId": "group-uuid-789",
  "senderUserId": "user-sub-123",
  "senderDeviceId": "device-uuid-111",
  "ciphertext": "base64-encrypted-payload",
  "timestamp": "2026-04-22T17:56:00Z",
  "queued": true
}
```

**Replay Complete (Direct):**
```json
{
  "eventType": "replay-complete",
  "messageCount": 5,
  "timestamp": "2026-04-22T18:00:00Z"
}
```

**Replay Complete (Group):**
```json
{
  "eventType": "group-replay-complete",
  "messageCount": 3,
  "timestamp": "2026-04-22T18:00:00Z"
}
```

**Notes:**
- Messages are replayed in chronological order
- `queued: true` indicates message was stored while offline
- Replay completes with boundary events
- Maximum replay window: 7 days

---

## 6) Important client rules

- Always send `X-Device-Id` on protected HTTP endpoints that require device trust.
- In production, do not rely on query-token auth fallback for WebSocket auth.
- Treat WebSocket `eventType: "error"` as operation failure even if socket stays open.
- Keep `messageId` / `groupMessageId` unique per send (idempotency keys).
- Store `accessToken` securely (keychain/keystore, not localStorage for web).
- Implement token refresh logic before `expiresIn` time.
- Handle WebSocket reconnection with exponential backoff.
- Always call `reconnect` action after WebSocket reconnection to retrieve queued messages.

---

## 7) Complete Integration Example

### 7.1 Initial Setup Flow

```javascript
// Step 1: Sign up
const signupResponse = await fetch(`${API_BASE_URL}/v1/auth/signup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!'
  })
});

// Step 2: User receives email with 6-digit code
// Step 3: Verify email
const verifyResponse = await fetch(`${API_BASE_URL}/v1/auth/verify-email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    code: '123456' // From email
  })
});

// Step 4: Sign in
const signinResponse = await fetch(`${API_BASE_URL}/v1/auth/signin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123!'
  })
});

const { accessToken, refreshToken, expiresIn } = await signinResponse.json();

// Step 5: Register device
const deviceId = generateUUID(); // Client-generated UUID
const registerResponse = await fetch(`${API_BASE_URL}/v1/devices/register`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`
  },
  body: JSON.stringify({
    deviceId: deviceId,
    deviceName: 'iPhone 14 Pro',
    platform: 'ios'
  })
});

// Step 6: Validate token and device
const meResponse = await fetch(`${API_BASE_URL}/v1/me`, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'X-Device-Id': deviceId
  }
});
```

### 7.2 WebSocket Connection

```javascript
// Connect to WebSocket
const ws = new WebSocket(
  `${WS_URL}/?deviceId=${deviceId}`,
  [],
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  }
);

ws.onopen = () => {
  console.log('WebSocket connected');
  
  // Request replay of queued messages
  ws.send(JSON.stringify({
    action: 'reconnect'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.eventType) {
    case 'direct-message':
      handleDirectMessage(message);
      break;
    case 'group-message':
      handleGroupMessage(message);
      break;
    case 'delivery-status':
      handleDeliveryStatus(message);
      break;
    case 'replay-complete':
      console.log(`Replayed ${message.messageCount} direct messages`);
      break;
    case 'group-replay-complete':
      console.log(`Replayed ${message.messageCount} group messages`);
      break;
    case 'error':
      handleError(message);
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket closed, reconnecting...');
  // Implement exponential backoff reconnection
  setTimeout(() => reconnectWebSocket(), 1000);
};
```

### 7.3 Sending Messages

```javascript
// Send direct message
function sendDirectMessage(recipientUserId, recipientDeviceId, encryptedPayload) {
  const messageId = generateUUID();
  
  ws.send(JSON.stringify({
    action: 'sendMessage',
    messageId: messageId,
    recipientUserId: recipientUserId,
    recipientDeviceId: recipientDeviceId,
    ciphertext: encryptedPayload
  }));
  
  return messageId; // Store for tracking delivery status
}

// Send group message
function sendGroupMessage(groupId, encryptedPayload) {
  const groupMessageId = generateUUID();
  
  ws.send(JSON.stringify({
    action: 'groupSend',
    groupMessageId: groupMessageId,
    groupId: groupId,
    ciphertext: encryptedPayload,
    attachments: []
  }));
  
  return groupMessageId;
}
```

### 7.4 Group Management

```javascript
// Create group
async function createGroup(groupName, memberUserIds) {
  const response = await fetch(`${API_BASE_URL}/v1/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-Id': deviceId
    },
    body: JSON.stringify({
      groupName: groupName,
      memberUserIds: memberUserIds
    })
  });
  
  return await response.json();
}

// Add member to group
async function addGroupMember(groupId, userId) {
  const response = await fetch(`${API_BASE_URL}/v1/groups/${groupId}/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-Id': deviceId
    },
    body: JSON.stringify({
      userId: userId
    })
  });
  
  return await response.json();
}

// Leave group
async function leaveGroup(groupId) {
  const response = await fetch(`${API_BASE_URL}/v1/groups/${groupId}/leave`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-Id': deviceId
    }
  });
  
  return await response.json();
}
```

---

## 8) Error Handling Best Practices

### 8.1 HTTP Error Handling

```javascript
async function makeAuthenticatedRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Device-Id': deviceId,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    
    switch (error.error.code) {
      case 'AUTH_USER_NOT_CONFIRMED':
        // Redirect to email verification
        redirectToVerification();
        break;
      case 'DEVICE_NOT_TRUSTED':
        // Re-register device
        await registerDevice();
        break;
      case 'AUTH_LIMIT_EXCEEDED':
        // Show rate limit message
        showRateLimitError();
        break;
      default:
        // Show generic error
        showError(error.error.message);
    }
    
    throw error;
  }
  
  return await response.json();
}
```

### 8.2 WebSocket Error Handling

```javascript
function handleWebSocketError(errorMessage) {
  switch (errorMessage.errorCode) {
    case 'RECIPIENT_OFFLINE':
      // Message queued, show pending status
      updateMessageStatus(errorMessage.messageId, 'queued');
      break;
    case 'INVALID_RECIPIENT':
      // Recipient doesn't exist
      showError('Recipient not found');
      break;
    case 'NOT_GROUP_MEMBER':
      // User not in group
      showError('You are not a member of this group');
      break;
    case 'ENCRYPTION_ERROR':
      // Encryption failed
      showError('Failed to encrypt message');
      break;
    default:
      showError(errorMessage.message);
  }
}
```

### 8.3 Token Refresh

```javascript
async function refreshAccessToken() {
  const response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: refreshToken
    })
  });
  
  if (response.ok) {
    const { accessToken: newAccessToken, expiresIn } = await response.json();
    accessToken = newAccessToken;
    
    // Schedule next refresh before expiry
    scheduleTokenRefresh(expiresIn);
  } else {
    // Refresh failed, redirect to login
    redirectToLogin();
  }
}

function scheduleTokenRefresh(expiresIn) {
  // Refresh 5 minutes before expiry
  const refreshTime = (expiresIn - 300) * 1000;
  setTimeout(() => refreshAccessToken(), refreshTime);
}
```

---

## 9) Quick smoke test (manual)

### Test 1: Authentication Flow
1. `POST /v1/auth/signup` with email/password → expect `200` with `userConfirmed: false`
2. Check email for 6-digit code
3. `POST /v1/auth/verify-email` with code → expect `200` with `verified: true`
4. `POST /v1/auth/signin` with credentials → expect `200` with tokens

### Test 2: Device Registration
1. Sign in → get `accessToken`
2. `POST /v1/devices/register` with device info → expect `200`
3. `GET /v1/me` with token + device header → expect `200` with `deviceTrusted: true`

### Test 3: Direct Messaging
1. Open WebSocket with token + `deviceId`
2. Send `reconnect` action → expect `replay-complete`
3. Send `sendMessage` to your own user/device (loopback)
4. Expect incoming events:
   - `direct-message` with your ciphertext
   - `delivery-status` with `status: "delivered"`

### Test 4: Group Messaging
1. `POST /v1/groups` to create group → expect `200` with `groupId`
2. `POST /v1/groups/{groupId}/members` to add member → expect `200`
3. Send `groupSend` via WebSocket → expect `group-message` event
4. Check `group-device-status` for delivery confirmation

### Test 5: Error Handling
1. `POST /v1/auth/verify-email` with invalid code → expect `400 AUTH_VERIFICATION_CODE_INVALID`
2. `POST /v1/auth/signin` with wrong password → expect `401 AUTH_SIGNIN_FAILED`
3. `GET /v1/me` without `X-Device-Id` header → expect `403 DEVICE_NOT_TRUSTED`
4. Send WebSocket message to non-existent user → expect `error` event with `INVALID_RECIPIENT`

---

## 10) Production Checklist

- [ ] Store tokens securely (keychain/keystore)
- [ ] Implement token refresh before expiry
- [ ] Handle WebSocket reconnection with exponential backoff
- [ ] Call `reconnect` action after WebSocket reconnection
- [ ] Validate all user inputs before sending to API
- [ ] Implement proper E2EE key management
- [ ] Handle offline message queuing
- [ ] Show delivery status for sent messages
- [ ] Implement rate limiting on client side
- [ ] Log errors for debugging (without exposing sensitive data)
- [ ] Test with poor network conditions
- [ ] Implement proper error messages for users
- [ ] Handle account lockout scenarios
- [ ] Test group messaging with multiple devices
- [ ] Verify message ordering is preserved
