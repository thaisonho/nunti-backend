# Production DNS and CDN Setup

## Architecture Overview

```
Users
  ↓
Route53 (DNS resolution)
  ↓
CloudFront (CDN edge, caching, WAF, DDoS protection)
  ↓
API Gateway (ALB equivalent in serverless)
  ↓
Lambda (compute layer in VPC)
  ↓
DynamoDB (data layer)
```

## Route53 Setup

### Prerequisites

1. **Hosted Zone:** Your domain must be registered and have Route53 hosted zone created
   - Example: `example.com` with hosted zone ID `Z123ABCDEFGHIJ`

2. **Nameservers:** Update domain registrar to point to Route53 nameservers
   - AWS Route53 Console → Hosted Zones → (select zone) → Copy NS record values
   - Update domain registrar nameserver settings to these Route53 nameservers

### Health Check Configuration

Route53 health check monitors API Gateway every 30 seconds:

```bash
aws route53 describe-health-check \
  --health-check-id {{HEALTH_CHECK_ID}} \
  --query 'HealthCheck.[HealthCheckConfig, HealthCheckObservations]'
```

If health check fails:
1. Route53 marks endpoint unhealthy
2. CloudWatch alarm triggers
3. Future phases (Phase 8+) can implement automatic failover

**Manual failover test:**
1. Stop API Gateway or Lambda concurrency
2. Observe Route53 health check fail in ~90 seconds (3 failures × 30sec)
3. Update DNS record to failover destination (if configured)
4. Resume API Gateway

### Updating DNS Records

To point production domain to CloudFront:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z123ABCDEFGHIJ \
  --change-batch file://dns-update.json
```

Where `dns-update.json` contains:
```json
{
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.example.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "Z2FDTNDATAQYW2",
          "DNSName": "d111111abcdef8.cloudfront.net",
          "EvaluateTargetHealth": true
        }
      }
    }
  ]
}
```

## CloudFront Configuration

### Cache Behavior

Production API endpoints are **cache-disabled** (no caching) because:
- Message delivery must reflect real-time state
- Caching stale data could cause message loss or duplication
- Dynamic WebSocket endpoints cannot be cached

Cache behavior per endpoint:

| Endpoint | Cache Policy | TTL | Reason |
|----------|--------------|-----|--------|
| /ws/* | Disabled | N/A | WebSocket is bidirectional, no HTTP caching |
| /v1/auth/* | Disabled | N/A | Auth tokens are sensitive, always fresh |
| /v1/messages/* | Disabled | N/A | Message delivery must be real-time |
| /health | Cached | 60s | Health check can be slightly stale |

### Distributions Status

View CloudFront distribution status:

```bash
aws cloudfront get-distribution-config \
  --id {{DISTRIBUTION_ID}} \
  --query 'DistributionConfig.[Enabled, Status, DomainName, Origins]'
```

Monitor CloudFront metrics in CloudWatch:

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name Requests \
  --dimensions Name=DistributionId,Value={{DISTRIBUTION_ID}} \
  --statistics Sum \
  --start-time 2026-04-10T00:00:00Z \
  --end-time 2026-04-10T23:59:59Z \
  --period 3600
```

### Cache Invalidation

If content needs to be refreshed before TTL expires:

```bash
aws cloudfront create-invalidation \
  --distribution-id {{DISTRIBUTION_ID}} \
  --paths "/*"
```

This invalidates all cached objects (useful after deployments). **Cost:** First 1,000 invalidations free/month, then $0.005 each. Use sparingly.

## WAF Configuration

### Rate Limiting

CloudFront WAF enforces rate limit:
- **Limit:** 100 requests per 5 minutes per IP
- **Action:** Block (return 403)
- **Bypass:** Only possible via AWS support (emergency override)

Check WAF metrics:

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/WAFV2 \
  --metric-name BlockedRequests \
  --dimensions Name=Rule,Value=RateLimitRule \
  --statistics Sum \
  --start-time 2026-04-10T00:00:00Z \
  --end-time 2026-04-10T23:59:59Z
```

### DDoS Protection

CloudFront includes AWS Shield Standard (free):
- Protects against common Layer 3/4 DDoS attacks
- Automatic mitigation for up to 100 Gbps+ attacks
- No configuration required

Advanced DDoS protection (AWS Shield Advanced) deferred to Phase 11.

## Logging and Monitoring

### CloudFront Logs

All CloudFront requests logged to S3:
- **Bucket:** `nunti-cloudfront-logs-{account-id}-production`
- **Path:** `cloudfront-logs/`
- **Retention:** 90 days (auto-deleted)
- **Format:** Tab-separated values (TSV), gzipped

Analyze logs:

```bash
aws s3 cp s3://nunti-cloudfront-logs-{account-id}-production/cloudfront-logs/2026-04-10-*.gz .
gunzip *.gz
awk -F'\t' '{print $4, $5}' *.log | sort | uniq -c | sort -rn | head -20
```

This shows top 20 URLs by request count.

### Health Check Alarming

CloudWatch alarm triggers if health check fails:
- **Alarm:** `nunti-production-api-health-down`
- **Threshold:** 2 consecutive failures (2 × 30sec = 60 sec total)
- **Action:** SNS notification (configure in Phase 11)

Check current alarm status:

```bash
aws cloudwatch describe-alarms --alarm-names nunti-production-api-health-down
```

## Troubleshooting

### DNS Resolution Issues

If `api.example.com` doesn't resolve:

1. **Check Route53 record exists:**
   ```bash
   aws route53 list-resource-record-sets \
     --hosted-zone-id Z123ABCDEFGHIJ \
     --query 'ResourceRecordSets[?Name==`api.example.com`]'
   ```

2. **Verify nameservers:**
   ```bash
   nslookup api.example.com
   dig api.example.com NS
   ```

3. **Clear local DNS cache:**
   - macOS: `sudo dscacheutil -flushcache`
   - Linux: `sudo systemctl restart systemd-resolved`
   - Windows: `ipconfig /flushdns`

### CloudFront Slow Response

If CloudFront is slow:

1. **Check origin health:** Is API Gateway responding?
   ```bash
   curl -I https://{{API_GATEWAY_DOMAIN}}/ -H "Host: api.example.com"
   ```

2. **Check CloudFront metrics:** Request count, error rate, latency
   - AWS Console → CloudFront → Monitoring → Distributions

3. **Invalidate cache:** Force refresh
   ```bash
   aws cloudfront create-invalidation --distribution-id {{ID}} --paths "/*"
   ```

### Health Check Failures

If Route53 marks API healthy but CloudFront still fails:

1. **Verify origin endpoint security group** allows CloudFront IPs
   - CloudFront uses multiple edge locations; allow all CloudFront IPs via
   - AWS Console → VPC → Security Groups or use `amazon.com` prefix list

2. **Check API Gateway integration:**
   - API Gateway must support HTTPS on port 443
   - SNI (Server Name Indication) must be enabled
   - Certificate must be valid and not expired

3. **Monitor API Gateway logs:**
   - AWS Console → API Gateway→ (select API) → Logs
   - Check for 5xx errors correlating with health check failures

## DNS Migration Checklist

When moving production to Route53 + CloudFront:

- [ ] Route53 hosted zone created
- [ ] Nameservers updated at domain registrar
- [ ] DNS propagation verified (2-48 hours typical)
- [ ] CloudFront distribution created and deployed
- [ ] Health check is passing consistently
- [ ] Route53 DNS record points to CloudFront
- [ ] SSL/TLS certificate valid on API Gateway
- [ ] WAF rules are active (check CloudWatch metrics)
- [ ] CloudFront logs flowing to S3
- [ ] Operator is monitoring health check alarm

## Phase Continuance

Future phases (Phase 8+) will enhance:
- Automatic failover routing
- Multi-endpoint load balancing
- Canary deployments via weighted routing
- Custom health check conditions
