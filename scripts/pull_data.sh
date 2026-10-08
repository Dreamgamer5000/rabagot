#!/usr/bin/env bash
# ==============================================================================
# PICSHARE - Pull Data from GCP Server
# Pulls /home/dream/picshare/data/ to ./data/ with local backup safety
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
echo " [1/3] Creating safety backup of local app.db..."
echo "========================================================"
if [ -f "data/app.db" ]; then
  TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
  BACKUP_FILE="data/app.db.bak_local_${TIMESTAMP}"
  cp "data/app.db" "${BACKUP_FILE}"
  echo "✓ Local database backed up to: ${BACKUP_FILE}"
else
  mkdir -p data
fi

echo ""
echo "========================================================"
echo " [2/3] Triggering remote SQLite checkpoint on server..."
echo "========================================================"
gcloud compute ssh "${GCP_VM_NAME}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  --command="if command -v sqlite3 >/dev/null 2>&1 && [ -f ${REMOTE_PATH}/app.db ]; then sqlite3 ${REMOTE_PATH}/app.db 'PRAGMA wal_checkpoint(TRUNCATE);'; fi"

echo ""
echo "========================================================"
echo " [3/3] Pulling data from ${GCP_VM_NAME}:${REMOTE_PATH}/ to ./data/..."
echo "========================================================"
GCLOUD_RSH="bash -c 'host=\"\$1\"; shift; exec gcloud compute ssh \"\$host\" --zone=\"${GCP_ZONE}\" --project=\"${GCP_PROJECT_ID}\" --quiet -- \"\$@\"' --"

rsync -avzP \
  -e "${GCLOUD_RSH}" \
  "${GCP_VM_NAME}:${REMOTE_PATH}/" \
  ./data/

echo ""
echo "========================================================"
echo "✓ Data pull completed successfully!"
echo "========================================================"
