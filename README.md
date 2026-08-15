# 📸 PICSHARE | AI-Powered Event Photography & Cloud Gallery

**PICSHARE** is a high-performance, full-stack photo sharing platform that leverages offline face recognition to automatically match guests with their event photos. It streamlines the delivery of event photography by syncing images from Google Drive, indexing them via AI, and allowing guests to find all their photos instantly with just a single selfie.

![Project Status](https://img.shields.io/badge/Status-Beta-orange)
![License](https://img.shields.io/badge/License-MIT-blue)
![Stack](https://img.shields.io/badge/Stack-FastAPI%20|%20Next.js%20|%20InsightFace-green)

---

## ✨ Key Features

- 👤 **AI Face Recognition**: Uses **InsightFace** (`buffalo_l`) for highly accurate, offline 512-dimensional facial recognition vector extraction.
- ⚡ **3-Tier High-Performance Storage Architecture**:
  - **Tier 1 (Grid Thumbnails)**: 512px JPEG (`data/thumbnails/`) for instantaneous grid card rendering.
  - **Tier 2 (2K WebP Screen Previews)**: 2048px WebP (`data/previews/`, Quality 82) for **< 4ms fullscreen viewing & zooming on 4K/Retina displays**, saving 95% bandwidth and 0 Google Drive API quota.
  - **Tier 3 (Master RAW Storage)**: Cold storage kept permanently for free on **Google Drive**, streamed on-demand only for single master downloads or ZIP packaging.
- 🗂️ **Multi-Select & Bulk ZIP Download**:
  - Top-left selection checkboxes on photo cards across Event and Guest galleries.
  - Sleek floating glassmorphism action dock with `Select All`, `Deselect All`, and single-click `Download ZIP (N)`.
  - Backend streaming ZIP packaging (`POST /photos/download-zip`) on-the-fly.
- 🔄 **Two-Way Deletion Sync & Delta Pruning**:
  - Compares Google Drive files with SQLite. Syncing automatically indexes new photos and prunes deleted Drive photos from the database, vectors, thumbnails, and preview cache.
- 🚀 **Configurable Parallel Syncing**:
  - Tune processing speed to your server hardware using `SYNC_CONCURRENCY` (1–2 for low-end VPS, 4–8 for standard servers, 12–16 for high-end Ryzen/GPU workstations).
- 📱 **Guest Self-Service & Fast AI Search**:
  - Guests take or upload a selfie to instantly receive a curated gallery of their matched event photos.
- 🗜️ **Client-Side Image Compression**:
  - Built-in canvas compression downsizes large mobile/DSLR selfies before upload, ensuring lightning-fast uploads and zero proxy payload errors.
- 🖼️ **Interactive Lightbox & Responsive Gallery**:
  - Pinch-to-zoom photo lightbox with keyboard navigation, touch swipe support, and instant blurred placeholders.
- 🛠️ **Admin Dashboard & Storage Breakdown**:
  - Comprehensive dashboard to manage events, track background sync progress, view guest scans, and inspect a multi-tier storage breakdown (Local SSD Previews + Thumbnails + Selfies vs Cloud Photos).
- 🚀 **High-Concurrency Database**:
  - SQLite configured with WAL mode (`PRAGMA journal_mode=WAL;`) and non-blocking asynchronous operations via `aiosqlite`.
- 📦 **Docker Ready**:
  - Fully containerized multi-stage Docker setup with hot-reloading development support.

---

## 🏗️ 3-Tier Storage Architecture

```
┌──────────────────────────────────────────────────────────┐
│                ☁️ Google Drive Folder                     │  <── Cold Master Storage (80+ GB Free)
└────────────────────────────┬─────────────────────────────┘
                             │  1. Ephemeral Sync Stream
                             ▼
┌──────────────────────────────────────────────────────────┐
│                  🚀 FastAPI Backend                      │
│   • InsightFace AI (512D Vector Extraction)              │
│   • 512px Grid Thumbnail Generator (JPEG)                │
│   • 2048px Screen Preview Generator (WebP, Q82)          │
│   • On-Demand Drive Master Stream & ZIP Packager         │
└───────┬────────────────────┬────────────────────┬────────┘
        │ 2. Vectors         │ 3. Thumbnails      │ 4. 2K Previews (~300 KB)
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ 🗄️ SQLite DB  │    │ 📁 data/      │    │ 📁 data/      │ (Total local SSD footprint:
│ (data/app.db) │    │   thumbnails/ │    │   previews/   │  ~3.5 GB for 10,000 photos)
└───────────────┘    └───────────────┘    └───────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │ 5. Instant < 4ms previews & face matches
                             ▼
┌──────────────────────────────────────────────────────────┐
│                🎨 Next.js 16 Client & UI                 │
│   • Instant 2K Lightbox Modal & Zoom                     │
│   • Multi-Select Top-Left Checkboxes                     │
│   • Floating Bulk ZIP Download Dock                      │
│   • Client-Side Compression & AI Selfie Matching         │
└──────────────────────────────────────────────────────────┘
```

### Performance Benchmarks

| Metric | Master Stream from Drive | 2K WebP SSD Tier | Improvement |
| :--- | :--- | :--- | :--- |
| **Fullscreen Modal Load Time** | ~2.0 to 5.0 s | **0.004 s (4 ms)** | 🚀 **~1,000x Faster** |
| **Fullscreen Image Payload** | 11 MB – 30 MB | **~250 KB – 350 KB** | 🗜️ **95% Bandwidth Saved** |
| **SSD Footprint for 10k Photos** | 300+ GB | **~3.5 GB** | 💾 **Fits on a $4 VPS** |
| **Google Drive API Quota Impact** | Hit on every click | **0 requests on preview** | 🛡️ **Zero 429 Rate Limits** |

---

## 💻 Tech Stack

- **Backend**: FastAPI (Python 3.12+), Uvicorn, InsightFace, OpenCV, PIL, `aiosqlite`, `pydantic`
- **Frontend**: Next.js 16 (React 19), TailwindCSS, Radix UI, Lucide Icons, Sonner, React Zoom Pan Pinch
- **AI/ML**: InsightFace (`buffalo_l` model, CPU & CUDA execution providers)
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
   - Share your Google Drive event folder with the Service Account email address with **Viewer** access.

2. **Backend Configuration**:
   Create `backend/.env`:

   ```ini
   # --- Security & Authentication ---
   ADMIN_PASSWORD=your_admin_password
   SECRET_KEY=YourSuperSecretKeyForJWT

   # --- Face Recognition Settings ---
   FACE_SIMILARITY_THRESHOLD=0.6

   # --- Sync & Performance Settings ---
   # Concurrency level: 1-2 for low-end VPS, 4-8 for standard servers, 10-16 for multi-core CPUs (e.g. Ryzen 9)
   SYNC_CONCURRENCY=4

   # --- Database & Storage Paths ---
   DB_PATH=data/app.db
   SERVICE_ACCOUNTS_DIR=data/accounts
   UPLOAD_ROOT=data/uploads
   THUMBNAIL_ROOT=data/thumbnails
   PREVIEWS_ROOT=data/previews
   ```

3. **Frontend Configuration**:
   Create `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=/api
   ```

### 3. Run with Docker 🐳

```bash
# Build and start all services
sudo docker compose up -d --build
```

The application will be accessible at:
- **Frontend / Public Gallery**: `http://localhost:3005`
- **Admin Dashboard**: `http://localhost:3005/admin/login`
- **Backend API**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

---

## 💻 Power User Workflows

### Pre-Indexing on High-Spec Laptop & Deploying to Low-Cost VPS
If you have a powerful workstation/laptop (e.g., AMD Ryzen 9 / Intel i9) and want to host on a budget VPS:

1. **Index Locally**: Set `SYNC_CONCURRENCY=12` in `backend/.env` on your laptop and sync the Google Drive folder.
2. **Transfer Pre-Computed Index & Previews**: Copy the lightweight SQLite DB, thumbnails, and 2K previews to your VPS:
   ```bash
   rsync -avz --progress ./backend/data/ user@your-vps-ip:/path/to/PICSHARE/backend/data/
   ```
3. **Run on VPS**: Start Docker on your VPS. The server immediately serves instant face recognition and 4ms 2K previews with **0% initial CPU indexing load** and minimal disk usage.

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

## 🙏 Credits & Acknowledgments

- **Original Creator**: [Yash Oswal](https://github.com/yashoswalyo) — Creator of the original PICSHARE project.
- **Naming**: Special thanks to [DanNoby](https://github.com/DanNoby/) and protein muesli (seriously) for naming the project **rabogat**.
- **AI Models**: Powered by the [InsightFace](https://github.com/deepinsight/insightface) library (`buffalo_l`).
- **Icons & UI**: [Lucide Icons](https://lucide.dev/) and [Radix UI](https://www.radix-ui.com/).

---

## 🔐 Security & License

- **License**: Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

**Built with ❤️ for [Event Photographers & Guests](https://github.com/Dreamgamer5000/rabogat)**
