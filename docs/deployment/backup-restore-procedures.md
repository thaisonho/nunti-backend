# Backup & Restore Procedures

## Overview

Production DynamoDB tables use a two-tier backup strategy:

1. **Point-in-Time Recovery (PITR)** — Continuous backups with 35-day window (AWS-managed)
2. **On-Demand Backups** — Scheduled snapshots with configurable retention (operator-managed)

## PITR (Point-in-Time Recovery)

PITR is enabled on all production tables via SAM template (`PointInTimeRecoveryEnabled: true`).

### Tables protected by PITR

| Table | PITR Status | Retention |
|-------|-------------|-----------|
| `nunti-devices-production` | ✅ Enabled | 35 days (AWS-managed) |
| `nunti-messages-production` | ✅ Enabled | 35 days (AWS-managed) |
| `nunti-connections-production` | ✅ Enabled | 35 days (AWS-managed) |

### PITR Restore

Restore to any point within the 35-day window:

```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name nunti-devices-production \
  --target-table-name nunti-devices-production-restore \
  --restore-date-time 2026-04-08T12:00:00Z \
  --region ap-southeast-1
```

**Important:** PITR restores to a *new* table. After verifying, swap table names or update application config.

## On-Demand Backup Script

### Running backups

```bash
# Production backup (default)
DEPLOY_ENV=production ./scripts/deploy/backup-strategy.sh

# Dry run (no changes)
DRY_RUN=true DEPLOY_ENV=production ./scripts/deploy/backup-strategy.sh

# Custom retention (30 days)
RETENTION_DAYS=30 DEPLOY_ENV=production ./scripts/deploy/backup-strategy.sh
```

### Scheduling (cron)

```cron
# Daily at 2:00 AM UTC
0 2 * * * cd /path/to/nunti-backend && DEPLOY_ENV=production ./scripts/deploy/backup-strategy.sh >> /var/log/nunti-backup.log 2>&1
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPLOY_ENV` | `production` | Target environment |
| `AWS_REGION` | `ap-southeast-1` | AWS region |
| `RETENTION_DAYS` | `7` | Days to keep on-demand backups |
| `DRY_RUN` | `false` | Set to `true` for validation without making changes |

## On-Demand Restore

Restore from a specific backup snapshot:

```bash
# List available backups
aws dynamodb list-backups \
  --table-name nunti-devices-production \
  --region ap-southeast-1

# Restore from backup
aws dynamodb restore-table-from-backup \
  --target-table-name nunti-devices-production-restore \
  --backup-arn arn:aws:dynamodb:ap-southeast-1:123456789:table/nunti-devices-production/backup/01234567890123-abcdef \
  --region ap-southeast-1
```

## Disaster Recovery Runbook

### Scenario: Corrupted data discovered

1. **Identify corruption window** — when did the bad write happen?
2. **Choose restore strategy:**
   - If within 35 days → PITR restore to just before corruption
   - If older than 35 days → On-demand backup restore (nearest snapshot)
3. **Restore to new table** (never overwrite production directly)
4. **Validate restored data** — spot-check key records
5. **Swap tables:**
   - Update `deploy/params.production.json` with restored table name
   - Redeploy Lambda to point to new table
6. **Clean up** — delete corrupted table after validation

### Scenario: Accidental table deletion

1. **Check PITR** — PITR survives table deletion for 35 days
2. **Restore** using `restore-table-to-point-in-time`
3. **Verify** table is accessible and data is intact
4. **Update stack** to re-register the table

### Scenario: Billing spike (provisioned mode)

1. **Switch to on-demand:** Update `DynamoDBBillingMode` to `PAY_PER_REQUEST` in `params.production.json`
2. **Redeploy:** `./scripts/deploy/deploy-stage.sh production`
3. **Monitor costs** via AWS Cost Explorer → DynamoDB filter

## Capacity Planning

| Mode | When to use | Params to set |
|------|-------------|---------------|
| `PAY_PER_REQUEST` (default) | Unknown traffic, spiky loads, early production | Just set `DynamoDBBillingMode` |
| `PROVISIONED` | Predictable traffic, cost optimization | Set `DynamoDBBillingMode`, `DynamoDBProvisionedReadCapacity`, `DynamoDBProvisionedWriteCapacity` |

**Switching modes:** Change `DynamoDBBillingMode` in `params.production.json` and redeploy. AWS allows one switch per day per table.
