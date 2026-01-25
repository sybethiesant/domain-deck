#!/bin/bash
#
# Domain Reseller Host-Level Restore Script
# Run this from the TrueNAS host (not inside containers)
#
# Usage: ./restore-host.sh <backup_file> [--yes]
#   backup_file: Path to backup tarball
#   --yes: Skip confirmation prompts
#
# Example:
#   sudo ./restore-host.sh /path/to/backups/worxtech_backup_20260124_120000.tar.gz

set -e

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

# Parse arguments
BACKUP_FILE="$1"
AUTO_YES="$2"

if [ -z "${BACKUP_FILE}" ]; then
    echo "Application Restore Script"
    echo ""
    echo "Usage: $0 <backup_file> [--yes]"
    echo ""
    echo "Available backups:"
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    APP_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
    ls -lh "${APP_DIR}/backups"/worxtech_backup_*.tar.gz 2>/dev/null | awk '{print "  " $NF " (" $5 ", " $6 " " $7 ")"}' || echo "  No backups found"
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    error "Backup file not found: ${BACKUP_FILE}"
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root (sudo)"
fi

# Check containers
log "Checking containers..."
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    error "Database container '${DB_CONTAINER}' is not running!"
fi
if ! docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
    error "App container '${APP_CONTAINER}' is not running!"
fi

log ""
log "=========================================="
log "       WORXTECH RESTORE"
log "=========================================="
log "Backup: ${BACKUP_FILE}"
log "Size: $(du -h "${BACKUP_FILE}" | cut -f1)"
log ""

# Confirmation
if [ "${AUTO_YES}" != "--yes" ]; then
    warn "⚠️  THIS WILL OVERWRITE ALL CURRENT DATA!"
    warn ""
    warn "This includes:"
    warn "  - All database records (users, domains, orders)"
    warn "  - Environment configuration (.env)"
    warn "  - Uploaded files"
    warn ""
    read -p "Type 'RESTORE' to confirm: " confirm
    if [ "${confirm}" != "RESTORE" ]; then
        log "Restore cancelled."
        exit 0
    fi
fi

# Extract backup
TEMP_DIR="/tmp/worxtech_restore_$$"
mkdir -p "${TEMP_DIR}"

log "Extracting backup..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find extracted directory
BACKUP_DIR=$(ls -d ${TEMP_DIR}/worxtech_backup_* 2>/dev/null | head -1)
if [ -z "${BACKUP_DIR}" ]; then
    rm -rf "${TEMP_DIR}"
    error "Invalid backup format"
fi

# Show manifest
if [ -f "${BACKUP_DIR}/manifest.txt" ]; then
    log ""
    log "Backup manifest:"
    echo "----------------------------------------"
    cat "${BACKUP_DIR}/manifest.txt"
    echo "----------------------------------------"
    log ""
fi

# Stop app to prevent writes during restore
log "Stopping application..."
docker exec ${APP_CONTAINER} pm2 stop all 2>/dev/null || true

# 1. Restore database
log "Restoring database..."
if [ -f "${BACKUP_DIR}/database.dump" ]; then
    # Terminate existing connections
    docker exec ${DB_CONTAINER} psql -U worxtech -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = 'worxtech' AND pid <> pg_backend_pid();" 2>/dev/null || true

    # Restore database
    if cat "${BACKUP_DIR}/database.dump" | docker exec -i ${DB_CONTAINER} pg_restore -U worxtech -d worxtech -c --if-exists 2>/dev/null; then
        log "  - Database restored"
    else
        warn "pg_restore reported warnings (often normal)"
    fi
else
    error "database.dump not found in backup!"
fi

# 2. Restore secrets
log "Restoring secrets..."
if [ -f "${BACKUP_DIR}/secrets/.env" ]; then
    docker cp "${BACKUP_DIR}/secrets/.env" ${APP_CONTAINER}:/app/backend/.env
    log "  - .env restored"
fi

if [ -f "${BACKUP_DIR}/secrets/.credentials.enc" ]; then
    docker cp "${BACKUP_DIR}/secrets/.credentials.enc" ${APP_CONTAINER}:/app/backend/.credentials.enc
    log "  - .credentials.enc restored"
fi

# 3. Restore uploads
log "Restoring uploads..."
if [ -d "${BACKUP_DIR}/uploads" ] && [ "$(ls -A ${BACKUP_DIR}/uploads 2>/dev/null)" ]; then
    docker exec ${APP_CONTAINER} mkdir -p /app/backend/uploads
    docker cp "${BACKUP_DIR}/uploads/." ${APP_CONTAINER}:/app/backend/uploads/
    log "  - uploads restored"
fi

# Cleanup temp files
rm -rf "${TEMP_DIR}"

# Restart application
log "Restarting application..."
docker exec ${APP_CONTAINER} pm2 restart all

# Wait for startup
sleep 3

# Verify
log "Verifying restore..."
if docker exec ${APP_CONTAINER} curl -s http://localhost:5001/api/health | grep -q '"status":"ok"'; then
    log "  - API health check: OK"
else
    warn "API health check failed - check logs"
fi

# Show database stats
log ""
log "Database stats after restore:"
docker exec ${DB_CONTAINER} psql -U worxtech -d worxtech -t -c "
    SELECT 'Users: ' || COUNT(*) FROM users
    UNION ALL SELECT 'Domains: ' || COUNT(*) FROM domains
    UNION ALL SELECT 'Orders: ' || COUNT(*) FROM orders
" 2>/dev/null | tr -d ' ' | sed 's/^/  /'

log ""
log "=========================================="
log "       RESTORE COMPLETE"
log "=========================================="
log ""
log "Verify the application is running correctly"
log ""
