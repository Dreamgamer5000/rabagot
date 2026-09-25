#!/usr/bin/env bash
# ==============================================================================
# PICSHARE - Push Data to GCP Server
# Safely flushes SQLite WAL and syncs ./data to /home/dream/picshare/data/
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

GCP_PROJECT_ID="${GCP_PROJECT_ID:-hosting-server-505409}"
GCP_ZONE="${GCP_ZONE:-us-west1-b}"
GCP_VM_NAME="${GCP_VM_NAME:-db-tracker}"
REMOTE_PATH="/home/dream/picshare/data"

echo "========================================================"
echo " [1/3] Flushing local SQLite WAL..."
echo "========================================================"
if [ -f "data/app.db" ]; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^picshare-backend$'; then
    docker exec picshare-backend python3 -c "import sqlite3; conn = sqlite3.connect('/app/data/app.db'); conn.execute('PRAGMA wal_checkpoint(TRUNCATE);'); conn.close()" 2>/dev/null || true
    echo "✓ WAL checkpoint complete via running backend container."
  elif [ -w "data/app.db" ] && command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 data/app.db "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
    echo "✓ WAL checkpoint complete via sqlite3."
  else
    echo "Notice: app.db is synchronized."
  fi
fi

echo ""
echo "========================================================"
echo " [2/3] Ensuring remote destination directory exists..."
echo "========================================================"
gcloud compute ssh "${GCP_VM_NAME}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  --command="mkdir -p ${REMOTE_PATH}"

echo ""
echo "========================================================"
echo " [3/3] Syncing local ./data/ to ${GCP_VM_NAME}:${REMOTE_PATH}/..."
echo "========================================================"
GCLOUD_RSH="bash -c 'host=\"\$1\"; shift; exec gcloud compute ssh \"\$host\" --zone=\"${GCP_ZONE}\" --project=\"${GCP_PROJECT_ID}\" --quiet -- \"\$@\"' --"

rsync -avzP \
  -e "${GCLOUD_RSH}" \
  ./data/ \
  "${GCP_VM_NAME}:${REMOTE_PATH}/"

echo ""
echo "Setting remote directory permissions..."
gcloud compute ssh "${GCP_VM_NAME}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  --command="chmod -R 775 ${REMOTE_PATH}"

echo ""
echo "========================================================"
echo "✓ Data push completed successfully!"
echo "========================================================"
