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

1. `POST /v1/auth/signin` with email/password.
2. Save `accessToken` (and refresh token if used by your app).
3. `POST /v1/devices/register` once per device.
4. For protected HTTP routes, send:
   - `Authorization: Bearer <accessToken>`
   - `X-Device-Id: <deviceId>`
5. Open WebSocket with:
   - URL: `wss://.../production/?deviceId=<deviceId>`
   - Header: `Authorization: Bearer <accessToken>` (or lowercase `authorization`)
6. Send WS actions (`sendMessage`, `groupSend`, etc.).
7. On reconnect, send `{"action":"reconnect"}` to replay queued events.

---

## 4) HTTP endpoints used by client

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/v1/auth/signup` | No | Create account |
| `POST` | `/v1/auth/signin` | No | Sign in, get tokens |
| `POST` | `/v1/auth/resend-verification` | No | Resend email verification |
| `GET` | `/v1/me` | Bearer + `X-Device-Id` | Validate token and trusted device |
| `POST` | `/v1/devices/register` | Bearer | Register current device |
| `GET` | `/v1/devices` | Bearer | List user devices |
| `POST` | `/v1/devices/{deviceId}/revoke` | Bearer | Revoke a device |
| `PUT` | `/v1/devices/{deviceId}/keys` | Bearer + `X-Device-Id` | Upload E2EE key bundle |
| `GET` | `/v1/users/{userId}/devices/{deviceId}/bootstrap` | Bearer + `X-Device-Id` | Fetch target device key bundle |
| `POST` | `/v1/groups` | Bearer + `X-Device-Id` | Create a group and optionally add initial members |
| `GET` | `/v1/groups/{groupId}` | Bearer + `X-Device-Id` | Get group metadata and full member list |
| `GET` | `/v1/groups/{groupId}/members` | Bearer + `X-Device-Id` | List group members |
| `POST` | `/v1/groups/{groupId}/members` | Bearer + `X-Device-Id` | Add a member to a group |
| `DELETE` | `/v1/groups/{groupId}/members/{userId}` | Bearer + `X-Device-Id` | Remove a member (admin/owner action) |
| `POST` | `/v1/groups/{groupId}/leave` | Bearer + `X-Device-Id` | Leave a group as current user |

### 4.1 Group management payloads (HTTP)

Create group:

```json
{
  "groupName": "Team Alpha",
  "memberUserIds": ["user-2", "user-3"]
}
```

Add member:

```json
{
  "userId": "user-4"
}
```

Leave group:

```json
POST /v1/groups/group-abc/leave
```

---

## 5) WebSocket actions to send from client

### 5.1 Direct message

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
