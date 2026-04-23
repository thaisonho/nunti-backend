# Conversations List API - AWS Console Deployment Guide

## Overview
This guide walks you through deploying the conversations list API endpoint that retrieves all conversations for a user from the DynamoDB messages table.

**Lambda Package:** `conversations-list-lambda.zip` (38MB)

**API Endpoint:** `GET /conversations/list`

**Authentication Required:** 
- Authorization header (Cognito JWT token)
- X-Device-Id header (trusted device ID)

---

## Step 1: Create the Lambda Function

1. **Open AWS Lambda Console**
   - Go to https://console.aws.amazon.com/lambda
   - Click **"Create function"**

2. **Configure Basic Settings**
   - Select **"Author from scratch"**
   - Function name: `nunti-conversations-list-production`
   - Runtime: **Node.js 20.x** (or your current Node version)
   - Architecture: **x86_64**

3. **Execution Role**
   - Select **"Use an existing role"**
   - Choose your existing Lambda execution role (the same one used by other nunti Lambda functions)
   - This role should have:
     - DynamoDB read permissions for `nunti-messages-v2-production` table
     - CloudWatch Logs permissions
     - Cognito permissions for token verification

4. **Click "Create function"**

---

## Step 2: Upload the Lambda Code

1. **In the Lambda function page, scroll to "Code source" section**

2. **Upload the deployment package**
   - Click **"Upload from"** dropdown
   - Select **".zip file"**
   - Click **"Upload"**
   - Select the file: `conversations-list-lambda.zip`
   - Click **"Save"**
   - Wait for the upload to complete (may take 1-2 minutes due to 38MB size)

3. **Configure the handler**
   - Scroll to **"Runtime settings"** section
   - Click **"Edit"**
   - Set Handler to: `dist/src/handlers/http/conversations-list.handler`
   - Click **"Save"**

---

## Step 3: Configure Environment Variables

1. **Scroll to "Configuration" tab**
2. **Click "Environment variables" in the left sidebar**
3. **Click "Edit"**
4. **Add the following environment variables** (use the same values as your other Lambda functions):

   ```
   COGNITO_USER_POOL_ID = <your-cognito-user-pool-id>
   COGNITO_REGION = <your-aws-region>
   DEVICES_TABLE_NAME = nunti-devices-v2-production
   MESSAGES_TABLE_NAME = nunti-messages-v2-production
   ```

5. **Click "Save"**

---

## Step 4: Configure Lambda Settings

1. **Still in "Configuration" tab, click "General configuration"**
2. **Click "Edit"**
3. **Set the following:**
   - Memory: **512 MB** (recommended for DynamoDB queries)
   - Timeout: **30 seconds**
   - Ephemeral storage: **512 MB** (default)

4. **Click "Save"**

---

## Step 5: Create API Gateway Integration

### Option A: Add to Existing API Gateway (Recommended)

1. **Open API Gateway Console**
   - Go to https://console.aws.amazon.com/apigateway
   - Select your existing **nunti API** (REST API)

2. **Create a new resource**
   - Click on the root `/` or `/conversations` resource
   - Click **"Actions"** → **"Create Resource"**
   - Resource Name: `list`
   - Resource Path: `/list`
   - Enable CORS: **Check this box**
   - Click **"Create Resource"**

3. **Create GET method**
   - Select the `/conversations/list` resource
   - Click **"Actions"** → **"Create Method"**
   - Select **"GET"** from dropdown
   - Click the checkmark ✓

4. **Configure GET method**
   - Integration type: **Lambda Function**
   - Use Lambda Proxy integration: **Check this box** ✓
   - Lambda Region: Select your region
   - Lambda Function: `nunti-conversations-list-production`
   - Click **"Save"**
   - Click **"OK"** when prompted to give API Gateway permission

5. **Enable CORS for the method**
   - Select the GET method
   - Click **"Actions"** → **"Enable CORS"**
   - Keep default settings
   - Click **"Enable CORS and replace existing CORS headers"**
   - Click **"Yes, replace existing values"**

6. **Deploy the API**
   - Click **"Actions"** → **"Deploy API"**
   - Deployment stage: Select your stage (e.g., `production`)
   - Click **"Deploy"**

7. **Note your API endpoint**
   - After deployment, you'll see: `Invoke URL: https://xxxxxxxxxx.execute-api.<region>.amazonaws.com/production`
   - Your full endpoint will be: `https://xxxxxxxxxx.execute-api.<region>.amazonaws.com/production/conversations/list`

---

## Step 6: Test the API

### Test from AWS Console

1. **In API Gateway, select the GET method under `/conversations/list`**
2. **Click "Test" (lightning bolt icon)**
3. **Add headers:**
   ```
   Authorization: Bearer <your-cognito-jwt-token>
   X-Device-Id: <your-device-id>
   ```
4. **Click "Test"**
5. **Expected response (200 OK):**
   ```json
   {
     "conversations": [
       {
         "userId": "user-id-123",
         "lastMessageTimestamp": "2026-04-23T22:00:00.000Z",
         "lastMessageId": "msg-abc-123",
         "lastMessageCiphertext": "encrypted-content",
         "lastMessageSenderId": "user-id-123",
         "unreadCount": 0
       }
     ],
     "count": 1
   }
   ```

### Test from your application

```bash
curl -X GET "https://your-api-gateway-url/production/conversations/list" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "X-Device-Id: YOUR_DEVICE_ID"
```

---

## Step 7: Verify DynamoDB Permissions

If you get permission errors, ensure your Lambda execution role has this policy:

1. **Go to IAM Console** → **Roles**
2. **Find your Lambda execution role**
3. **Verify it has a policy with these permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:GetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:<region>:<account-id>:table/nunti-messages-v2-production",
        "arn:aws:dynamodb:<region>:<account-id>:table/nunti-messages-v2-production/index/*"
      ]
    }
  ]
}
```

---

## Troubleshooting

### Error: "Missing X-Device-Id header"
- Ensure you're sending the `X-Device-Id` header with each request
- Check that the device ID matches a trusted device in your devices table

### Error: "AUTH_FORBIDDEN"
- Verify the JWT token is valid and not expired
- Ensure the device is marked as trusted in the devices table
- Check that the user ID in the token matches the device owner

### Error: "Internal server error"
- Check CloudWatch Logs for the Lambda function
- Go to Lambda → Monitor → View logs in CloudWatch
- Look for detailed error messages

### Empty conversations array
- This is normal if the user has no messages in their inbox
- Messages are only stored in the inbox of the recipient, not the sender
- To see conversations, you need to have received messages from other users

### Lambda timeout
- If you have many conversations, increase the Lambda timeout
- Go to Lambda → Configuration → General configuration → Edit
- Increase timeout to 60 seconds

---

## API Response Format

**Success Response (200):**
```json
{
  "conversations": [
    {
      "userId": "string",
      "lastMessageTimestamp": "ISO-8601 timestamp",
      "lastMessageId": "string",
      "lastMessageCiphertext": "string",
      "lastMessageSenderId": "string",
      "unreadCount": 0
    }
  ],
  "count": number
}
```

**Error Response (400/401/403/500):**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

---

## Next Steps

After deployment:
1. Update your frontend to call this endpoint on app startup
2. Store the conversations list in local state/storage
3. Use this list to populate the conversations UI
4. Implement periodic refresh to get new conversations

---

## Notes

- **Conversations are derived from the inbox:** Each user's inbox contains messages they've received
- **Only received messages appear:** Sent messages are stored in the recipient's inbox, not yours
- **Messages are encrypted:** The `ciphertext` field contains the encrypted message content
- **No explicit conversation IDs:** Conversations are identified by the other user's ID
- **Sorted by most recent:** Conversations are ordered by the timestamp of the last message
