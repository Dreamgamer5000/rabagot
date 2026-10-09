# Multi-Instance & Caddy Deployment Guide

This guide explains how to deploy and manage multiple independent **PICSHARE (rabagot)** instances on a single server or workstation (e.g., hosting `weddingphotos.rejit.in` alongside `farewell.rejit.in`), using **Caddy** as the reverse proxy for automatic SSL/TLS.

---

## Architecture Overview

When running multiple instances on the same host, each instance requires unique isolation across four layers:

| Layer | Configuration Variable | Purpose |
| :--- | :--- | :--- |
| **Compose Project** | `COMPOSE_PROJECT_NAME` | Prevents Docker Compose from grouping or overwriting containers/volumes from another instance. |
| **Container Names** | `BACKEND_CONTAINER_NAME`<br>`FRONTEND_CONTAINER_NAME` | Prevents Docker naming collision errors (`Conflict. The container name "/picshare-backend" is already in use`). |
| **Internal Routing** | `BACKEND_HOSTNAME` | Directs Next.js SSR / API proxy calls to the correct backend container inside the Docker network. |
| **Host Ports (Optional)** | `FRONTEND_PORT`<br>`BACKEND_PORT` | Avoids port conflicts (e.g. `0.0.0.0:3005:3000` collision) when exposing ports to the host machine. |

```
                              [ Internet ]
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │        Caddy Server           │
                   │  (Auto HTTPS via Let's Encrypt)│
                   └───────┬───────────────┬───────┘
                           │               │
       farewell.rejit.in   │               │   weddingphotos.rejit.in
                           ▼               ▼
           ┌───────────────────────┐ ┌───────────────────────┐
           │ farewell-frontend     │ │ picshare-frontend     │
           │ (port 3000)           │ │ (port 3000)           │
           └───────────┬───────────┘ └───────────┬───────────┘
                       │                         │
                       ▼                         ▼
           ┌───────────────────────┐ ┌───────────────────────┐
           │ farewell-backend      │ │ picshare-backend      │
           │ (port 8000)           │ │ (port 8000)           │
           └───────────────────────┘ └───────────────────────┘
```

---

## Step-by-Step: Setting Up a Fresh / Second Instance

Follow these steps whenever launching a new event gallery (e.g. `farewell.rejit.in`):

### 1. Create a Dedicated Folder & Clone the Repo

On your server or local machine:

```bash
# Example: Create a directory for farewell
mkdir -p /home/dream/Documents/farewell_host/rabagot
cd /home/dream/Documents/farewell_host/rabagot

# Clone the repository (or copy workspace)
git clone <your-repo-url> .
```

### 2. Configure `.env` for the New Instance

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and set unique instance parameters:

```bash
# --- Multi-Instance & Docker Container Naming ---
COMPOSE_PROJECT_NAME=farewell
BACKEND_CONTAINER_NAME=farewell-backend
FRONTEND_CONTAINER_NAME=farewell-frontend

# CRITICAL: BACKEND_HOSTNAME must match BACKEND_CONTAINER_NAME:8000
BACKEND_HOSTNAME=farewell-backend:8000

# Host Ports (must be unique per instance if exposing to host)
FRONTEND_PORT=3006
BACKEND_PORT=8001

# Public Domain & Remote Directory
PUBLIC_DOMAIN=farewell.rejit.in
REMOTE_APP_DIR=/home/dream/farewell

# --- Security & Auth (Always generate a fresh SECRET_KEY!) ---
ADMIN_PASSWORD=your_secure_farewell_password
SECRET_KEY=$(openssl rand -hex 32)

# --- Storage Paths ---
LOCAL_PHOTOS_DIR=/photos/farewell
STORAGE_DIR=/app/data
```

> [!IMPORTANT]
> **Crucial Rule for `BACKEND_HOSTNAME`**:  
> The Next.js frontend calls the backend internally over the Docker network. If you change `BACKEND_CONTAINER_NAME` to `farewell-backend`, you **must** set `BACKEND_HOSTNAME=farewell-backend:8000`.

---

### 3. Ensure the Shared Docker Network Exists (Production)

If using `docker-compose.prod.yml`, the containers attach to an external Docker network named `web_net`. Create it once if it doesn't already exist:

```bash
sudo docker network create web_net
```

---

### 4. Start the Application

#### Option A: Local Development / Non-Production
```bash
docker compose up -d --build
```
Your instance will be available locally on:
- Frontend: `http://localhost:3006`
- Backend API: `http://localhost:8001`

#### Option B: Production (Attached to `web_net`)
```bash
docker compose -f docker-compose.prod.yml up -d
```

#### Option C: Automated Deployment via Script
Update `.env` with your GCP/Server details and run:
```bash
bash scripts/deploy_server.sh
```

---

## Configuring Caddy Reverse Proxy

Caddy handles automatic SSL/TLS certificates and proxies web traffic to each instance.

### Method 1: Caddy in Docker (Recommended)

When Caddy runs as a Docker container attached to `web_net`, it can route directly to each frontend container name:

```caddy
# /etc/caddy/Caddyfile (or mounted Caddyfile)

# --- Instance 1 ---
weddingphotos.rejit.in {
    encode gzip zstd
    request_body {
        max_size 500MB
    }
    reverse_proxy picshare-frontend:3000
}

# --- Instance 2 ---
farewell.rejit.in {
    encode gzip zstd
    request_body {
        max_size 500MB
    }
    reverse_proxy farewell-frontend:3000
}
```

### Method 2: Caddy on Host OS (Systemd / Binary)

If Caddy is installed directly on Ubuntu/Debian (`apt install caddy`), proxy to the host port bindings:

```caddy
# /etc/caddy/Caddyfile

weddingphotos.rejit.in {
    encode gzip zstd
    request_body {
        max_size 500MB
    }
    reverse_proxy 127.0.0.1:3005
}

farewell.rejit.in {
    encode gzip zstd
    request_body {
        max_size 500MB
    }
    reverse_proxy 127.0.0.1:3006
}
```

### Apply Caddy Configuration Without Downtime

Reload Caddy without dropping active connections:

```bash
# If running as systemd service:
sudo systemctl reload caddy

# Or using the Caddy CLI directly:
sudo caddy reload --config /etc/caddy/Caddyfile

# If running Caddy in Docker:
docker exec -w /etc/caddy <caddy-container-name> caddy reload
```

---

## Quick Reference: Two Instances Side-by-Side

| Setting | Instance 1 (Wedding) | Instance 2 (Farewell) |
| :--- | :--- | :--- |
| **Directory** | `/home/dream/picshare` | `/home/dream/farewell` |
| **`COMPOSE_PROJECT_NAME`** | `picshare` | `farewell` |
| **`BACKEND_CONTAINER_NAME`** | `picshare-backend` | `farewell-backend` |
| **`FRONTEND_CONTAINER_NAME`**| `picshare-frontend` | `farewell-frontend` |
| **`BACKEND_HOSTNAME`** | `picshare-backend:8000` | `farewell-backend:8000` |
| **`FRONTEND_PORT`** | `3005` | `3006` |
| **`BACKEND_PORT`** | `8000` | `8001` |
| **Domain** | `weddingphotos.rejit.in` | `farewell.rejit.in` |
| **Caddy Target** | `picshare-frontend:3000` | `farewell-frontend:3000` |

---

## Troubleshooting

### 1. `Conflict. The container name "/picshare-backend" is already in use by container...`
- **Cause**: Both directories have identical `BACKEND_CONTAINER_NAME` or `FRONTEND_CONTAINER_NAME`.
- **Fix**: Check `.env` in the new directory and ensure `BACKEND_CONTAINER_NAME` and `FRONTEND_CONTAINER_NAME` are unique (e.g. prefix with `farewell-`).

### 2. Frontend loads, but API requests / image search fail with 500 / Network Error
- **Cause**: Next.js server cannot reach backend inside Docker because `BACKEND_HOSTNAME` does not match `BACKEND_CONTAINER_NAME:8000`.
- **Fix**: Ensure `BACKEND_HOSTNAME=${BACKEND_CONTAINER_NAME}:8000` in `.env`.

### 3. Port already allocated (`bind: address already in use`)
- **Cause**: Both instances are trying to bind the same host port (e.g. `3005` or `8000`).
- **Fix**: Change `FRONTEND_PORT` (e.g. `3006`) and `BACKEND_PORT` (e.g. `8001`) in `.env`.

### 4. Stuck or Runaway Indexing Sync
- **UI Action**: Click the red **"Stop Sync"** button on the event card in the Admin Dashboard.
- **API Action**: Send a POST request to `/api/photos/sync/{event_id}/stop` (or `/photos/sync/{event_id}/stop` on backend port 8000).
- **Result**: Cancels the active worker coroutines, stops downloading, sets `sync_status` to `stopped`, and leaves already indexed photos intact so indexing can resume anytime.
