#!/bin/bash
#
# WorxTech Host-Level Backup Script
# Run this from the TrueNAS host (not inside containers)
#
# Usage: ./backup-host.sh [backup_dir] [keep_count]
#   backup_dir: Where to store backups (default: same directory as WorxTech app)
#   keep_count: Number of backups to retain (default: 7)
#
# Setup as cron job on TrueNAS:
#   0 2 * * * /mnt/.ix-apps/docker/volumes/mealplanner_project-files/_data/WorxTech/backend/scripts/backup-host.sh
#
# Or run manually:
#   sudo /path/to/backup-host.sh

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
BACKUP_DIR="${1:-${APP_DIR}/backups}"
KEEP_COUNT="${2:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="worxtech_backup_${TIMESTAMP}"
TEMP_DIR="/tmp/${BACKUP_NAME}"

# Container names
APP_CONTAINER="worxtech-app"
DB_CONTAINER="worxtech-db"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"; exit 1; }

# Check if running as root (needed for docker)
if [ "$EUID" -ne 0 ]; then
    warn "Not running as root - docker commands may fail"
fi

# Check containers are running
log "Checking containers..."
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    error "Database container '${DB_CONTAINER}' is not running!"
fi
if ! docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
    error "App container '${APP_CONTAINER}' is not running!"
fi
log "  - Both containers running"

# Create directories
mkdir -p "${BACKUP_DIR}"
mkdir -p "${TEMP_DIR}"
mkdir -p "${TEMP_DIR}/secrets"

log "Starting WorxTech backup..."
log "Backup directory: ${BACKUP_DIR}"
log "Retention: ${KEEP_COUNT} backups"

# 1. Database dump (run pg_dump inside db container)
log "Dumping PostgreSQL database..."
if docker exec ${DB_CONTAINER} pg_dump -U worxtech -d worxtech -F c > "${TEMP_DIR}/database.dump" 2>/dev/null; then
    DUMP_SIZE=$(du -h "${TEMP_DIR}/database.dump" | cut -f1)
    log "  - Database dump complete (${DUMP_SIZE})"
else
    error "Database dump failed!"
fi

# 2. Copy secrets from app container
log "Backing up secrets..."
if docker cp ${APP_CONTAINER}:/app/backend/.env "${TEMP_DIR}/secrets/.env" 2>/dev/null; then
    log "  - .env copied"
else
    warn ".env not found"
fi

if docker cp ${APP_CONTAINER}:/app/backend/.credentials.enc "${TEMP_DIR}/secrets/.credentials.enc" 2>/dev/null; then
    log "  - .credentials.enc copied"
else
    warn ".credentials.enc not found (auto-refill may not be configured)"
fi

# 3. Copy uploads
log "Backing up uploads..."
if docker cp ${APP_CONTAINER}:/app/backend/uploads "${TEMP_DIR}/uploads" 2>/dev/null; then
    log "  - uploads copied"
else
    mkdir -p "${TEMP_DIR}/uploads"
    warn "uploads directory empty or not found"
fi

# 4. Create manifest
log "Creating manifest..."
cat > "${TEMP_DIR}/manifest.txt" << EOF
WorxTech Backup Manifest
========================
Created: $(date '+%Y-%m-%d %H:%M:%S %Z')
Host: $(hostname)
Backup: ${BACKUP_NAME}

Contents:
  database.dump       - PostgreSQL custom format dump
  secrets/.env        - Environment variables and API keys
  secrets/.credentials.enc - Encrypted payment credentials
  uploads/            - Uploaded files (logos, etc.)

Container Versions:
  App: $(docker inspect ${APP_CONTAINER} --format '{{.Config.Image}}' 2>/dev/null || echo 'unknown')
  DB:  $(docker inspect ${DB_CONTAINER} --format '{{.Config.Image}}' 2>/dev/null || echo 'unknown')

Database Stats:
$(docker exec ${DB_CONTAINER} psql -U worxtech -d worxtech -t -c "
  SELECT 'Users: ' || COUNT(*) FROM users
  UNION ALL SELECT 'Domains: ' || COUNT(*) FROM domains
  UNION ALL SELECT 'Orders: ' || COUNT(*) FROM orders
" 2>/dev/null | tr -d ' ' || echo '  (stats unavailable)')

Restore Instructions:
  1. Extract: tar -xzf ${BACKUP_NAME}.tar.gz
  2. Restore DB: cat database.dump | docker exec -i ${DB_CONTAINER} pg_restore -U worxtech -d worxtech -c --if-exists
  3. Restore secrets: docker cp secrets/. ${APP_CONTAINER}:/app/backend/
  4. Restore uploads: docker cp uploads/. ${APP_CONTAINER}:/app/backend/uploads/
  5. Restart: docker exec ${APP_CONTAINER} pm2 restart all
EOF

# 5. Create compressed archive
log "Creating backup archive..."
cd /tmp
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${TEMP_DIR}"

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
log "Backup created: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# 6. Rolling retention
log "Applying retention policy..."
cd "${BACKUP_DIR}"
BACKUP_COUNT=$(ls -1 worxtech_backup_*.tar.gz 2>/dev/null | wc -l)

if [ "${BACKUP_COUNT}" -gt "${KEEP_COUNT}" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - KEEP_COUNT))
    ls -1t worxtech_backup_*.tar.gz | tail -n "${REMOVE_COUNT}" | while read old_backup; do
        log "  - Removing: ${old_backup}"
        rm -f "${old_backup}"
    done
fi

# 7. Summary
echo ""
log "=========================================="
log "       BACKUP COMPLETE"
log "=========================================="
log "File: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
log "Size: ${BACKUP_SIZE}"
echo ""
log "Current backups:"
ls -lh "${BACKUP_DIR}"/worxtech_backup_*.tar.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
log "=========================================="
