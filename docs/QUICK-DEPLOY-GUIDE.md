# Quick Deploy Guide - Signal Protocol E2EE Fix

**Priority**: HIGH  
**Estimated Time**: 1 hour  
**Risk Level**: LOW (simple authorization fix + new endpoint)

---

## TL;DR

- Fixed: Authorization blocking cross-user key fetching
- Added: Device discovery endpoint
- No database changes needed
- Client code works as-is after deployment

---

## Deploy Steps (5 minutes)

### 1. Build
```bash
npm run build
```

### 2. Deploy Lambda (new function)
- **Name**: `nunti-http-users-devices-list`
- **Handler**: `dist/src/handlers/http/users-devices-list.handler`
- **Runtime**: Node.js 18.x
- **Role**: `NuntiRuntimeRole` (same as other HTTP handlers)
- **Env vars**: Copy from existing HTTP handlers

### 3. Configure API Gateway
- **Route**: `GET /v1/users/{userId}/devices`
- **Integration**: Lambda proxy → `nunti-http-users-devices-list`
- **Payload format**: `1.0`

### 4. Deploy API Gateway
- Deploy to `staging` stage first
- Test (see below)
- Deploy to `production` stage

---

## Test Commands (2 minutes)

```bash
# Replace with your actual values
API_URL="https://your-api.execute-api.region.amazonaws.com/production"
TOKEN="your-access-token"
USER_B_ID="target-user-id"
DEVICE_ID="your-device-id"

# Test 1: Device discovery (NEW endpoint)
curl -X GET "$API_URL/v1/users/$USER_B_ID/devices" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 200 OK with device list

# Test 2: Cross-user key fetch (FIXED - was 403, now 200)
curl -X GET "$API_URL/v1/users/$USER_B_ID/devices/some-device-id/bootstrap" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Device-Id: $DEVICE_ID"

# Expected: 200 OK with key bundle
```

---

## What Changed

### Code Changes
1. `src/devices/device-service.ts` - Removed same-user check (3 lines)
2. `src/handlers/http/users-devices-list.ts` - New file (42 lines)

### Infrastructure Changes
1. New Lambda function: `nunti-http-users-devices-list`
2. New API route: `GET /v1/users/{userId}/devices`

### Database Changes
**NONE** - Current schema is correct

---

## Rollback (if needed)

### Quick Rollback
1. Delete API Gateway route: `GET /v1/users/{userId}/devices`
2. Revert `device-service.ts` to previous commit
3. Redeploy

### Git Rollback
```bash
git revert HEAD
npm run build
# Redeploy Lambda functions
```

---

## Success Criteria

✅ New endpoint returns 200 OK  
✅ Bootstrap endpoint returns 200 OK (not 403)  
✅ Client can send E2EE messages  
✅ No errors in CloudWatch Logs  

---

## Monitoring

Watch for 15 minutes after deployment:

```bash
# CloudWatch Logs
aws logs tail /aws/lambda/nunti-http-users-devices-list --follow

# API Gateway metrics
# Check 4xx/5xx rates in AWS Console
```

---

## Contacts

- **Questions**: See `docs/TICKET-RESOLUTION.md`
- **Issues**: Check `docs/TICKET-ANALYSIS.md`
- **Client team**: Notify after successful deployment

---

## Files to Review (if needed)

- Full analysis: `docs/TICKET-ANALYSIS.md`
- Deployment details: `docs/TICKET-RESOLUTION.md`
- Implementation summary: `docs/IMPLEMENTATION-SUMMARY.md`
- API reference: `docs/client-application-development.md`

---

**Ready to deploy? Follow steps 1-4 above. Good luck! 🚀**
