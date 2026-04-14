# Production Network Architecture

## VPC Isolation

Production uses a separate VPC (10.1.0.0/16) completely isolated from staging:

- **Public Subnet:** 10.1.0.0/24 (NAT Gateway, Internet Gateway)
- **Private Subnets:** 10.1.1.0/24 (Lambda), 10.1.2.0/24 (Lambda backup)
- **NAT Gateway:** Enables Lambda outbound internet access (for external API calls) without exposing Lambda to inbound internet routing
- **Availability Zones:** Private subnets span 2 AZs for resilience

## Security Group Rules (Least-Privilege)

**Production Lambda Security Group:**

- Ingress: None (Lambda is invoked by API Gateway, not via network ingress)
- Egress:
  - HTTPS (443) to DynamoDB security group (CIDR: 10.1.1.0/25)
  - HTTPS (443) to external APIs (0.0.0.0/0 — required for Cognito, external integrations)
  - DNS (53/UDP) to 0.0.0.0/0 (required for DNS resolution)

**Production DynamoDB Security Group:**

- Ingress: HTTPS (443) from ProductionLambdaSecurityGroup only
- Egress: None (DynamoDB is inbound-only)

**Production API Gateway Security Group:**

- Ingress: HTTPS (443) from CloudFront distribution (or specific CloudFront IP range)
- Purpose: Bridges public internet → Private Lambda compute via edge

## Network Data Flow

```
Internet (Users)
    ↓
Route53 health check + failover logic
    ↓
CloudFront CDN (caching, DDoS protection)
    ↓
API Gateway (staging: direct, production: behind security group)
    ↓
NAT Gateway (ensures Lambda egress routing control)
    ↓
Lambda (in ProductionPrivateSubnet1/2, ProductionLambdaSecurityGroup)
    ↓
DynamoDB (VPC endpoint or intra-VPC, ProductionDynamoDBSecurityGroup)
```

## Operator Steps for Production Deployment

1. Verify production VPC exists in AWS account (or will be created by SAM template)
2. Update GitHub Actions secret `PROD_VPC_ID` with actual VPC ID (if VPC pre-created)
3. Update `deploy/params.production.json` with actual security group IDs output from first template.yaml deployment
4. Run production deployment: `./scripts/deploy/deploy-stage.sh production`
5. Verify security group ingress/egress rules in AWS Console → VPC → Security Groups
6. Test: curl through CloudFront to API Gateway → should reach Lambda → should reach DynamoDB

## Checklist: Production Infrastructure Ready

- [ ] VPC created with CIDR 10.1.0.0/16
- [ ] Public subnet (10.1.0.0/24) has Internet Gateway attached
- [ ] Private subnets (10.1.1.0/24, 10.1.2.0/24) have NAT Gateway routes
- [ ] Lambda security group allows HTTPS egress to DynamoDB CIDR (10.1.1.0/25)
- [ ] Lambda security group allows HTTPS egress to external 0.0.0.0/0 (Cognito, etc.)
- [ ] DynamoDB security group allows HTTPS ingress from Lambda security group only
- [ ] API Gateway security group allows HTTPS ingress from CloudFront or public
- [ ] Security group IDs exported from `sam deploy` output
- [ ] params.production.json updated with actual security group IDs
