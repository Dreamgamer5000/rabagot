#!/usr/bin/env bash
# ==============================================================================
# PICSHARE - Deploy to GCP Server (db-tracker)
# Builds latest diff, pushes to Artifact Registry, transfers configs, and starts stack
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
GCP_REGION="${GCP_REGION:-us-west1}"
GCP_REPO_NAME="${GCP_REPO_NAME:-tracker-repo}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
NEXT_PUBLIC_UMAMI_WEBSITE_ID="${NEXT_PUBLIC_UMAMI_WEBSITE_ID:-f7fe8c3d-060b-480c-90c5-bf72c35098db}"
NEXT_PUBLIC_UMAMI_SCRIPT_URL="${NEXT_PUBLIC_UMAMI_SCRIPT_URL:-https://cloud.umami.is/script.js}"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-picshare}"
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-${COMPOSE_PROJECT_NAME}-backend}"
FRONTEND_CONTAINER_NAME="${FRONTEND_CONTAINER_NAME:-${COMPOSE_PROJECT_NAME}-frontend}"
BACKEND_HOSTNAME="${BACKEND_HOSTNAME:-${BACKEND_CONTAINER_NAME}:8000}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/dream/${COMPOSE_PROJECT_NAME}}"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-weddingphotos.rejit.in}"

REGISTRY="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_REPO_NAME}"
BACKEND_IMAGE="${REGISTRY}/${BACKEND_CONTAINER_NAME}:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGISTRY}/${FRONTEND_CONTAINER_NAME}:${IMAGE_TAG}"

echo "========================================================"
echo " [1/5] Building latest Docker images (layer cached)..."
echo "========================================================"
echo "-> Building backend image: ${BACKEND_IMAGE}"
docker build \
  -t "${BACKEND_CONTAINER_NAME}:latest" \
  -t "${BACKEND_IMAGE}" \
  ./backend

echo "-> Building frontend image: ${FRONTEND_IMAGE}"
docker build \
  --build-arg NEXT_PUBLIC_API_URL="/api" \
  --build-arg BACKEND_HOSTNAME="${BACKEND_HOSTNAME}" \
  --build-arg NEXT_PUBLIC_UMAMI_WEBSITE_ID="${NEXT_PUBLIC_UMAMI_WEBSITE_ID}" \
  --build-arg NEXT_PUBLIC_UMAMI_SCRIPT_URL="${NEXT_PUBLIC_UMAMI_SCRIPT_URL}" \
  -t "${FRONTEND_CONTAINER_NAME}:latest" \
  -t "${FRONTEND_IMAGE}" \
  ./frontend

echo ""
echo "========================================================"
echo " [2/5] Configuring Docker authentication with GCP..."
echo "========================================================"
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

echo ""
echo "========================================================"
echo " [3/5] Pushing image deltas to GCP Artifact Registry..."
echo "========================================================"
echo "-> Pushing backend..."
docker push "${BACKEND_IMAGE}"
echo "-> Pushing frontend..."
docker push "${FRONTEND_IMAGE}"

echo ""
echo "========================================================"
echo " [4/5] Preparing server directory & transferring configs..."
echo "========================================================"
gcloud compute ssh "${GCP_VM_NAME}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  --command="mkdir -p ${REMOTE_APP_DIR} ${REMOTE_APP_DIR}/data"

echo "-> Copying docker-compose.prod.yml..."
gcloud compute scp \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  docker-compose.prod.yml \
  "${GCP_VM_NAME}:${REMOTE_APP_DIR}/docker-compose.prod.yml"

echo "-> Copying .env..."
gcloud compute scp \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  .env \
  "${GCP_VM_NAME}:${REMOTE_APP_DIR}/.env"

echo ""
echo "========================================================"
echo " [5/5] Pulling and launching containers on ${GCP_VM_NAME}..."
echo "========================================================"
gcloud compute ssh "${GCP_VM_NAME}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  --command="cd ${REMOTE_APP_DIR} && sudo docker compose -f docker-compose.prod.yml pull && sudo docker compose -f docker-compose.prod.yml up -d"

echo ""
echo "========================================================"
echo " Verifying server deployment..."
echo "========================================================"
gcloud compute ssh "${GCP_VM_NAME}" \
  --zone="${GCP_ZONE}" \
  --project="${GCP_PROJECT_ID}" \
  --command="sudo docker ps --filter 'name=${BACKEND_CONTAINER_NAME}'"

if [ -n "${PUBLIC_DOMAIN}" ]; then
  echo ""
  echo "Testing public domain: https://${PUBLIC_DOMAIN}"
  sleep 2
  curl -I -s "https://${PUBLIC_DOMAIN}" | head -n 10 || true
fi

echo ""
echo "========================================================"
echo "✓ Deployment complete! Stack is running on GCP."
echo "========================================================"
