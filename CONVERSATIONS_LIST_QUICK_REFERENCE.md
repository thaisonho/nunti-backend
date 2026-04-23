# Conversations List API - Quick Reference

## What This API Does

Retrieves all conversations for the authenticated user by querying their inbox in the DynamoDB messages table. Returns a list of conversations sorted by most recent message.

## Files Created/Modified

- `src/handlers/http/conversations-list.ts` - New HTTP handler
- `src/messages/message-repository.ts` - Added `listConversations()` function and `ConversationSummary` interface
- `src/handlers/http/conversations-check.ts` - Fixed bug (device.deviceId → deviceId)

## Deployment Package

**File:** `conversations-list-lambda.zip` (38MB)
**Location:** `/workspaces/nunti-backend/conversations-list-lambda.zip`

## API Endpoint

```
GET /conversations/list
```

**Headers Required:**
- `Authorization: Bearer <jwt-token>`
- `X-Device-Id: <device-id>`

**Response:**
```json
{
  "conversations": [
    {
      "userId": "user-id",
      "lastMessageTimestamp": "2026-04-23T22:00:00.000Z",
      "lastMessageId": "msg-id",
      "lastMessageCiphertext": "encrypted-content",
      "lastMessageSenderId": "user-id",
      "unreadCount": 0
    }
  ],
  "count": 1
}
```

## How It Works

1. Queries the user's inbox: `INBOX#{userId}#{deviceId}`
2. Groups messages by sender (conversation partner)
3. Returns the most recent message from each conversation
4. Sorts conversations by most recent message timestamp

## Important Notes

- **Only shows received messages** - Sent messages are in the recipient's inbox, not yours
- **Messages are encrypted** - The ciphertext field contains encrypted content
- **No explicit conversation IDs** - Conversations are identified by the other user's ID
- **Device-specific** - Each device has its own inbox

## Testing

```bash
curl -X GET "https://your-api-url/production/conversations/list" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-Device-Id: YOUR_DEVICE_ID"
```

## Full Deployment Guide

See: `docs/CONVERSATIONS_LIST_DEPLOYMENT_GUIDE.md`
