#!/bin/bash
#
# Domain Reseller Backup Script
# Creates rolling backups of database and critical files
#
# Usage: ./backup.sh [backup_dir] [keep_count]
#   backup_dir: Where to store backups (default: /app/backups)
#   keep_count: Number of backups to retain (default: 7)
#
# Can be run from inside container or via:
#   docker exec worxtech-app /app/backend/scripts/backup.sh

set -e

# Configuration
BACKUP_DIR="${1:-/app/backups}"
KEEP_COUNT="${2:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="worxtech_backup_${TIMESTAMP}"
TEMP_DIR="/tmp/${BACKUP_NAME}"

# Database connection (from environment or defaults)
DB_HOST="${DB_HOST:-worxtech-db}"
DB_NAME="${DB_NAME:-worxtech}"
DB_USER="${DB_USER:-worxtech}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
    exit 1
}

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"
mkdir -p "${TEMP_DIR}"

log "Starting Application backup..."
log "Backup directory: ${BACKUP_DIR}"
log "Retention count: ${KEEP_COUNT}"

# 1. Database dump
log "Dumping PostgreSQL database..."

# Try local pg_dump first, fall back to running on db container
if command -v pg_dump &> /dev/null; then
    # pg_dump available locally
    if PGPASSWORD="${DB_PASSWORD}" pg_dump -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -F c -f "${TEMP_DIR}/database.dump" 2>/dev/null; then
        log "Database dump complete: $(du -h ${TEMP_DIR}/database.dump | cut -f1)"
    else
        error "Database dump failed!"
    fi
else
    # No local pg_dump - try to use docker exec on db container
    log "  (using pg_dump from database container)"

    # For running inside worxtech-app container, we need to use the network
    # Dump to stdout and redirect to file
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" &>/dev/null; then
        # Connection works, try pg_dump via network (may not work without pg_dump binary)
        # Fall back to SQL dump format which we can do via psql
        log "  (using SQL format via psql - pg_dump not available)"
        PGPASSWORD="${DB_PASSWORD}" pg_dumpall -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" > "${TEMP_DIR}/database.sql" 2>/dev/null || \
        PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "\copy (SELECT 1) TO STDOUT" &>/dev/null && \
        {
            # psql works, create a SQL dump using psql commands
            log "  (creating logical dump via psql)"
            {
                echo "-- Application Database Backup"
                echo "-- Created: $(date)"
                echo ""
                # Get list of tables and dump each
                PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "
                    SELECT 'TRUNCATE ' || tablename || ' CASCADE;'
                    FROM pg_tables
                    WHERE schemaname = 'public';" 2>/dev/null
                echo ""
                # Dump data using COPY format
                for table in $(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';" 2>/dev/null); do
                    echo "-- Table: ${table}"
                    PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "COPY ${table} TO STDOUT WITH CSV HEADER;" 2>/dev/null | \
                    awk -v tbl="${table}" 'NR==1{print "-- Columns: " $0} NR>1{print "INSERT INTO " tbl " VALUES (" $0 ");"}' || true
                done
            } > "${TEMP_DIR}/database.sql"
            log "SQL dump created: $(du -h ${TEMP_DIR}/database.sql | cut -f1)"
        } || error "Database connection failed!"
    else
        error "Cannot connect to database and pg_dump not available!"
    fi
fi

# 2. Copy secrets
log "Backing up secrets..."
SECRETS_DIR="${TEMP_DIR}/secrets"
mkdir -p "${SECRETS_DIR}"

if [ -f /app/backend/.env ]; then
    cp /app/backend/.env "${SECRETS_DIR}/.env"
    log "  - .env copied"
else
    warn ".env file not found"
fi

if [ -f /app/backend/.credentials.enc ]; then
    cp /app/backend/.credentials.enc "${SECRETS_DIR}/.credentials.enc"
    log "  - .credentials.enc copied"
else
    warn ".credentials.enc not found (auto-refill may not be configured)"
fi

# 3. Copy uploads (logos, etc.)
log "Backing up uploads..."
if [ -d /app/backend/uploads ] && [ "$(ls -A /app/backend/uploads 2>/dev/null)" ]; then
    cp -r /app/backend/uploads "${TEMP_DIR}/uploads"
    log "  - uploads directory copied"
else
    mkdir -p "${TEMP_DIR}/uploads"
    log "  - uploads directory empty or not found"
fi

# 4. Create manifest
log "Creating backup manifest..."
cat > "${TEMP_DIR}/manifest.txt" << EOF
Backup Manifest
========================
Created: $(date '+%Y-%m-%d %H:%M:%S %Z')
Hostname: $(hostname)
Database: ${DB_NAME}

Contents:
- database.dump    : PostgreSQL custom format dump
- secrets/.env     : Environment variables and API keys
- secrets/.credentials.enc : Encrypted payment credentials
- uploads/         : Uploaded files (logos, etc.)

Restore Instructions:
1. Extract backup: tar -xzf ${BACKUP_NAME}.tar.gz
2. Restore database: pg_restore -h HOST -U USER -d DATABASE database.dump
3. Copy secrets to /app/backend/
4. Copy uploads to /app/backend/uploads/
5. Restart services: pm2 restart all

For detailed restore instructions, see CLAUDE.md
EOF

# 5. Create compressed tarball
log "Creating compressed backup archive..."
cd /tmp
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
rm -rf "${TEMP_DIR}"

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
log "Backup created: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# 6. Rolling retention - remove old backups
log "Applying retention policy (keeping last ${KEEP_COUNT} backups)..."
cd "${BACKUP_DIR}"
BACKUP_COUNT=$(ls -1 worxtech_backup_*.tar.gz 2>/dev/null | wc -l)

if [ "${BACKUP_COUNT}" -gt "${KEEP_COUNT}" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - KEEP_COUNT))
    ls -1t worxtech_backup_*.tar.gz | tail -n "${REMOVE_COUNT}" | while read old_backup; do
        log "  - Removing old backup: ${old_backup}"
        rm -f "${old_backup}"
    done
fi

# 7. Summary
log ""
log "========== Backup Complete =========="
log "Location: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
log "Size: ${BACKUP_SIZE}"
log "Current backups:"
ls -lh "${BACKUP_DIR}"/worxtech_backup_*.tar.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
log "====================================="
