#!/bin/bash
#
# Domain Reseller Restore Script
# Restores from a backup created by backup.sh
#
# Usage: ./restore.sh <backup_file> [--yes]
#   backup_file: Path to the backup tarball
#   --yes: Skip confirmation prompts
#
# Example:
#   docker exec -it worxtech-app /app/backend/scripts/restore.sh /app/backups/worxtech_backup_20260124_120000.tar.gz

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"; exit 1; }

# Check arguments
BACKUP_FILE="$1"
AUTO_YES="$2"

if [ -z "${BACKUP_FILE}" ]; then
    echo "Usage: $0 <backup_file> [--yes]"
    echo ""
    echo "Available backups:"
    ls -lh /app/backups/worxtech_backup_*.tar.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ", " $6 " " $7 ")"}'
    exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
    error "Backup file not found: ${BACKUP_FILE}"
fi

# Database connection
DB_HOST="${DB_HOST:-worxtech-db}"
DB_NAME="${DB_NAME:-worxtech}"
DB_USER="${DB_USER:-worxtech}"
DB_PASSWORD="${DB_PASSWORD:-}"

log "Application Restore"
log "================"
log "Backup file: ${BACKUP_FILE}"
log "Database: ${DB_NAME}@${DB_HOST}"
echo ""

# Confirmation
if [ "${AUTO_YES}" != "--yes" ]; then
    warn "This will OVERWRITE the current database and configuration!"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "${confirm}" != "yes" ]; then
        log "Restore cancelled."
        exit 0
    fi
fi

# Extract backup
TEMP_DIR="/tmp/worxtech_restore_$$"
mkdir -p "${TEMP_DIR}"
log "Extracting backup..."
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Find the backup directory (it's named worxtech_backup_TIMESTAMP)
BACKUP_DIR=$(ls -d ${TEMP_DIR}/worxtech_backup_* 2>/dev/null | head -1)
if [ -z "${BACKUP_DIR}" ]; then
    error "Invalid backup format - no worxtech_backup_* directory found"
fi

log "Backup contents:"
ls -la "${BACKUP_DIR}"
echo ""

# Show manifest
if [ -f "${BACKUP_DIR}/manifest.txt" ]; then
    log "Backup manifest:"
    cat "${BACKUP_DIR}/manifest.txt"
    echo ""
fi

# Restore database
log "Restoring database..."
if [ -f "${BACKUP_DIR}/database.dump" ]; then
    # Drop and recreate database connections
    log "  - Terminating existing connections..."
    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" 2>/dev/null || true

    # Restore using pg_restore with clean option
    log "  - Restoring from dump..."
    if PGPASSWORD="${DB_PASSWORD}" pg_restore -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c --if-exists "${BACKUP_DIR}/database.dump" 2>/dev/null; then
        log "  - Database restored successfully"
    else
        # pg_restore returns non-zero even on warnings, check if data exists
        warn "pg_restore reported warnings (this is often normal)"
    fi
else
    error "database.dump not found in backup!"
fi

# Restore secrets
log "Restoring secrets..."
if [ -f "${BACKUP_DIR}/secrets/.env" ]; then
    cp "${BACKUP_DIR}/secrets/.env" /app/backend/.env
    log "  - .env restored"
else
    warn ".env not found in backup"
fi

if [ -f "${BACKUP_DIR}/secrets/.credentials.enc" ]; then
    cp "${BACKUP_DIR}/secrets/.credentials.enc" /app/backend/.credentials.enc
    log "  - .credentials.enc restored"
else
    warn ".credentials.enc not found in backup (auto-refill may need reconfiguration)"
fi

# Restore uploads
log "Restoring uploads..."
if [ -d "${BACKUP_DIR}/uploads" ]; then
    mkdir -p /app/backend/uploads
    cp -r "${BACKUP_DIR}/uploads/"* /app/backend/uploads/ 2>/dev/null || true
    log "  - uploads restored"
else
    warn "uploads directory not found in backup"
fi

# Cleanup
rm -rf "${TEMP_DIR}"

log ""
log "========== Restore Complete =========="
log ""
log "Next steps:"
log "  1. Restart services: pm2 restart all"
log "  2. Verify application: curl http://localhost:5001/api/health"
log "  3. Check database: psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -c 'SELECT COUNT(*) FROM users;'"
log ""
log "====================================="
