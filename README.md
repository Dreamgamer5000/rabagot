# 📸 PICSHARE | AI-Powered Event Photography

**PICSHARE** is a high-performance, full-stack photo sharing platform that leverages offline face recognition to automatically match guests with their event photos. It streamlines the delivery of event photography by syncing images from Google Drive, indexing them via AI, and allowing guests to find all their photos instantly with just a single selfie.

![Project Status](https://img.shields.io/badge/Status-Beta-orange)
![License](https://img.shields.io/badge/License-MIT-blue)
![Stack](https://img.shields.io/badge/Stack-FastAPI%20|%20Next.js%20|%20InsightFace-green)

---

## ✨ Key Features

- 👤 **AI Face Matching**: Uses the **InsightFace** library (`buffalo_l`) for highly accurate, offline 512-dimensional facial recognition vector extraction.
- ☁️ **Ephemeral Storage & Google Drive Cold Storage**: Automatically fetches images from Google Drive, extracts face embeddings, generates lightweight web thumbnails, and immediately purges local raw originals. An 80+ GB photo collection consumes only **~1–2 GB** on your server.
- ⚡ **Configurable Parallel Syncing**: Tune processing speed to your server hardware using `SYNC_CONCURRENCY` (e.g. 1–2 for low-end VPS, 4–8 for standard servers, 12–16 for high-end Ryzen/GPU workstations).
- 🔄 **DB-Driven Incremental Resync**: Compares Google Drive file IDs (`f['id']`) against SQLite to instantly delta-sync only new or modified photos with 0 redundant downloads.
- 📡 **On-Demand Google Drive Streaming**: Full-resolution master photos and personalized guest ZIP archives are streamed live on-demand directly from Google Drive.
- 📱 **Guest Self-Service & Fast AI Search**: Guests upload a selfie and instantly receive a curated gallery of their matched event photos.
- 🗜️ **Client-Side Image Optimization**: Built-in client-side canvas compression downsizes large mobile/DSLR selfies before upload, ensuring lightning-fast uploads and zero proxy payload errors.
- 🖼️ **Interactive Lightbox & Responsive Gallery**: Full-featured event gallery with pinch/zoom photo lightbox, pagination, and multi-resolution viewing.
- 🛠️ **Admin Dashboard & Storage Breakdown**: Comprehensive dashboard to manage events, track background sync progress, view guest scans, and monitor local VPS storage vs cloud-backed photo counts.
- 🚀 **High-Concurrency Database**: SQLite configured with WAL mode (`PRAGMA journal_mode=WAL;`) and non-blocking asynchronous operations via `aiosqlite`.
- 📦 **Docker Ready**: Fully containerized multi-stage Docker setup with Docker Compose.

---

## 🏗️ Architecture

```
┌───────────────────────────────┐
│     ☁️ Google Drive Folder     │  <── Authoritative Cold Storage (80+ GB)
└──────────────┬────────────────┘
               │  1. Ephemeral stream
               ▼
┌───────────────────────────────┐
│     🚀 FastAPI Backend         │
│  • InsightFace AI (512D)      │
│  • PIL Web Thumbnail Gen      │
│  • Configurable Concurrency   │
└───────┬───────────────┬───────┘
        │ 2. Vectors    │ 3. Thumbnails (~100 KB)
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│ 🗄️ SQLite DB  │ │ 📁 Local Disk │ (Local VPS footprint: < 2 GB)
│ (data/app.db) │ │(thumbnails/)  │
└───────────────┘ └───────────────┘
        │               │
        └───────┬───────┘
                │ 4. Serve gallery & instant face matches
                ▼
┌───────────────────────────────┐
│   🎨 Next.js 16 Client & UI   │
│  • Client-side Compression    │
│  • Lightbox & Guest Galleries │
└───────────────────────────────┘
```

### Tech Stack
- **Backend**: FastAPI (Python 3.12+), Uvicorn, InsightFace, OpenCV, PIL, `aiosqlite`
- **Frontend**: Next.js 16 (React 19), TailwindCSS, Radix UI, Lucide Icons, Sonner
- **AI/ML**: InsightFace (`buffalo_l` model, CPU & GPU execution providers)
- **Database**: SQLite with Write-Ahead Logging (WAL)
- **Orchestration**: Docker & Docker Compose
- **Package Managers**: `pip` (Backend), `bun` (Frontend)

---

## ⚡ Quick Start

### 1. Prerequisites
- **Docker & Docker Compose** (Recommended)
- **Google Cloud Service Account** (with Google Drive API enabled)
- **Python 3.10+** & **Bun** (for local development)

### 2. Configure Environment

1. **Google Drive Setup**:
   - Create a Google Cloud Project and enable the **Google Drive API**.
   - Create a **Service Account**, download the JSON key file, and place it in `backend/data/accounts/0.json` (or configure `backend/credentials.json`).
   - Share your Google Drive event folder with the Service Account email address with **Viewer** (or Editor) access.

2. **Backend Configuration**:
   Create `backend/.env` (defaults provided):

   ```ini
   # --- Security & Authentication ---
   ADMIN_PASSWORD=dream123
   SECRET_KEY=ThisIsMyLongSecretKeyForJWT

   # --- Face Recognition Settings ---
   FACE_SIMILARITY_THRESHOLD=0.6

   # --- Sync & Performance Settings ---
   # Concurrency level: 1-2 for low-end VPS, 4-8 for standard servers, 10-16 for multi-core CPUs (e.g. Ryzen 9)
   SYNC_CONCURRENCY=4

   # --- Database & Storage Paths ---
   DB_PATH=data/app.db
   SERVICE_ACCOUNTS_DIR=data/accounts
   ```

3. **Frontend Configuration**:
   Create `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=/api
   ```

### 3. Run with Docker 🐳

```bash
# Build and start the services in background
docker compose up -d --build
```

The application will be accessible at:
- **Frontend**: `http://localhost:3005`
- **Admin Dashboard**: `http://localhost:3005/admin/login`
- **Backend API**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

---

## 💻 Power User Workflows

### Pre-Indexing on High-Spec Laptop & Deploying to Low-Cost VPS
If you have a powerful workstation/laptop (e.g., AMD Ryzen 9 / Intel i9) and want to host on a budget VPS:

1. **Index Locally**: Set `SYNC_CONCURRENCY=12` in `backend/.env` on your laptop and sync the Google Drive folder.
2. **Transfer Pre-Computed Index**: Copy only the lightweight SQLite DB and generated thumbnails to your VPS:
   ```bash
   rsync -avz --progress ./data/ user@your-vps-ip:/path/to/PICSHARE/data/
   ```
3. **Run on VPS**: Start Docker on your VPS. The server immediately serves instant face recognition with **0% initial CPU indexing load** and minimal disk usage.

---

## 🛠️ Local Development

### Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
bun install
bun run dev
```

---

## 🔐 Security & License

- **Security**: Report security vulnerabilities responsibly.
- **License**: Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

**Built by [Yash Oswal](https://github.com/yashoswalyo) with ❤️**
