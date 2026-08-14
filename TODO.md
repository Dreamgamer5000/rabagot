# Production & Deployment Checklist (TODO)

## Pre-Production & Deployment Tasks

- [ ] **Docker Compose Production Volumes**:
  - Remove `./backend/app:/app/app:z` bind mount from [`docker-compose.yml`](file:///home/dream/Documents/PICSHARE/docker-compose.yml#L5-L7) before deploying to production/server so containers remain immutable and rely solely on the image build.
  - Keep only the persistent data volume: `./data:/app/data:z`.

- [ ] **Environment & Security**:
  - Ensure `SECRET_KEY` and `ADMIN_PASSWORD` in [`backend/.env`](file:///home/dream/Documents/PICSHARE/backend/.env) are set to strong, unique production secrets.
  - Verify that `NEXT_PUBLIC_API_URL` and `BACKEND_HOSTNAME` are appropriately configured for the production domain / reverse proxy (e.g. Nginx, Caddy, or Cloudflare).

- [ ] **Data Persistence & Backups**:
  - Set up regular automated backups for `data/app.db` and uploaded photos in `data/uploads/` on the production server.
