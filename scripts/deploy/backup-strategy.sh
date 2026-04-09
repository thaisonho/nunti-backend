#!/usr/bin/env bash
# ============================================================================
# DynamoDB Backup Strategy Script
# ============================================================================
# Creates on-demand backups for all Nunti production DynamoDB tables.
# Designed to be run via cron, CI/CD, or manually by operators.
#
# Usage:
#   DEPLOY_ENV=production ./scripts/deploy/backup-strategy.sh
#
# Environment variables:
#   DEPLOY_ENV       - Target environment (default: production)
#   AWS_REGION       - AWS region (default: ap-southeast-1)
#   RETENTION_DAYS   - Days to keep backups (default: 7)
#   DRY_RUN          - Set to "true" for a dry run (no backups created)
# ============================================================================

set -euo pipefail

DEPLOY_ENV="${DEPLOY_ENV:-production}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
DRY_RUN="${DRY_RUN:-false}"

# Table names follow the convention: nunti-{name}-{environment}
TABLES=(
  "nunti-devices-${DEPLOY_ENV}"
  "nunti-messages-${DEPLOY_ENV}"
  "nunti-connections-${DEPLOY_ENV}"
)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BACKUP_PREFIX="scheduled-${TIMESTAMP}"

echo "================================================="
echo "  DynamoDB Backup Strategy"
echo "================================================="
echo "  Environment:    ${DEPLOY_ENV}"
echo "  Region:         ${AWS_REGION}"
echo "  Retention:      ${RETENTION_DAYS} days"
echo "  Backup prefix:  ${BACKUP_PREFIX}"
echo "  Dry run:        ${DRY_RUN}"
echo "  Tables:         ${#TABLES[@]}"
echo "================================================="

# ------------------------------------------------------------------
# Step 1: Verify PITR is enabled on all tables
# ------------------------------------------------------------------
echo ""
echo "=== Step 1: Verify PITR Status ==="
PITR_ERRORS=0

for TABLE in "${TABLES[@]}"; do
  PITR_STATUS=$(aws dynamodb describe-continuous-backups \
    --table-name "${TABLE}" \
    --region "${AWS_REGION}" \
    --query "ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus" \
    --output text 2>/dev/null || echo "UNKNOWN")

  if [[ "${PITR_STATUS}" == "ENABLED" ]]; then
    echo "  ✅ ${TABLE}: PITR enabled"
  else
    echo "  ❌ ${TABLE}: PITR ${PITR_STATUS} — must be enabled!"
    PITR_ERRORS=$((PITR_ERRORS + 1))
  fi
done

if [[ ${PITR_ERRORS} -gt 0 ]]; then
  echo ""
  echo "⚠️  ${PITR_ERRORS} table(s) missing PITR. Enable PITR before proceeding."
  echo "    Fix: Update template.yaml PointInTimeRecoveryEnabled: true and redeploy."
  exit 1
fi

# ------------------------------------------------------------------
# Step 2: Create on-demand backups
# ------------------------------------------------------------------
echo ""
echo "=== Step 2: Create On-Demand Backups ==="

BACKUP_ARNS=()
for TABLE in "${TABLES[@]}"; do
  BACKUP_NAME="${TABLE}-${BACKUP_PREFIX}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "  🔍 [DRY RUN] Would create backup: ${BACKUP_NAME}"
    continue
  fi

  echo "  📦 Creating backup for ${TABLE}..."
  BACKUP_ARN=$(aws dynamodb create-backup \
    --table-name "${TABLE}" \
    --backup-name "${BACKUP_NAME}" \
    --region "${AWS_REGION}" \
    --query "BackupDetails.BackupArn" \
    --output text)

  echo "     ARN: ${BACKUP_ARN}"
  BACKUP_ARNS+=("${BACKUP_ARN}")
done

# ------------------------------------------------------------------
# Step 3: Clean up old backups beyond retention period
# ------------------------------------------------------------------
echo ""
echo "=== Step 3: Clean Up Old Backups ==="

CUTOFF_EPOCH=$(date -u -d "${RETENTION_DAYS} days ago" +%s 2>/dev/null || \
               date -u -v-${RETENTION_DAYS}d +%s 2>/dev/null || echo "0")

if [[ "${CUTOFF_EPOCH}" == "0" ]]; then
  echo "  ⚠️  Could not compute cutoff date. Skipping cleanup."
else
  for TABLE in "${TABLES[@]}"; do
    echo "  🔄 Checking old backups for ${TABLE}..."

    OLD_BACKUPS=$(aws dynamodb list-backups \
      --table-name "${TABLE}" \
      --region "${AWS_REGION}" \
      --time-range-upper-bound "$(date -u -d "${RETENTION_DAYS} days ago" --iso-8601=seconds 2>/dev/null || date -u -v-${RETENTION_DAYS}d +%Y-%m-%dT%H:%M:%SZ)" \
      --query "BackupSummaries[?starts_with(BackupName, 'scheduled-')].BackupArn" \
      --output text 2>/dev/null || echo "")

    if [[ -z "${OLD_BACKUPS}" ]]; then
      echo "     No expired backups found."
      continue
    fi

    for BACKUP_ARN in ${OLD_BACKUPS}; do
      if [[ "${DRY_RUN}" == "true" ]]; then
        echo "     🔍 [DRY RUN] Would delete: ${BACKUP_ARN}"
      else
        echo "     🗑️  Deleting: ${BACKUP_ARN}"
        aws dynamodb delete-backup \
          --backup-arn "${BACKUP_ARN}" \
          --region "${AWS_REGION}" > /dev/null
      fi
    done
  done
fi

# ------------------------------------------------------------------
# Step 4: Summary
# ------------------------------------------------------------------
echo ""
echo "================================================="
echo "  Backup Complete"
echo "================================================="
echo "  Backups created:  ${#BACKUP_ARNS[@]}"
echo "  Timestamp:        ${TIMESTAMP}"
echo "  Next run:         Schedule via cron or CI/CD"
echo "================================================="
echo ""
echo "Restore commands (if needed):"
echo "  # PITR restore (last 35 days):"
echo "  aws dynamodb restore-table-to-point-in-time \\"
echo "    --source-table-name TABLE_NAME \\"
echo "    --target-table-name TABLE_NAME-restore \\"
echo "    --restore-date-time YYYY-MM-DDTHH:MM:SSZ"
echo ""
echo "  # On-demand backup restore:"
echo "  aws dynamodb restore-table-from-backup \\"
echo "    --target-table-name TABLE_NAME-restore \\"
echo "    --backup-arn BACKUP_ARN"
