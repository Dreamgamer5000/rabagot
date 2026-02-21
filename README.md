# 📸 PICSHARE | AI-Powered Event Photography

**PICSHARE** is a high-performance, full-stack photo sharing platform that leverages offline face recognition to automatically match guests with their event photos. It streamlines the delivery of event photography by syncing images from Google Drive, indexing them via AI, and allowing guests to find all their photos instantly with just a single selfie.

![Project Status](https://img.shields.io/badge/Status-Beta-orange)
![License](https://img.shields.io/badge/License-MIT-blue)
![Stack](https://img.shields.io/badge/Stack-FastAPI%20|%20Next.js%20|%20InsightFace-green)

---

## ✨ Features

- 👤 **AI Face Matching**: Uses the **InsightFace** library for highly accurate, offline facial recognition.
- ☁️ **Google Drive Sync**: Automatically fetches and indexes images from specific Google Drive folders.
- 🚀 **FastAPI Backend**: High-performance Python backend with asynchronous database operations via `aiosqlite`.
- 🎨 **Modern Frontend**: Sleek, responsive Next.js dashboard and guest portal with Dark Mode support.
- 📱 **Guest Self-Service**: Guests upload a selfie and instantly receive a curated gallery of their photos.
- 🛠️ **Admin Dashboard**: Full control over events, guest management, and photo processing.
- 🔄 **Efficient Background Tasks**: Dedicated cron workers for periodic sync and recovery tasks.
- 📦 **Docker Ready**: Fully containerized setup for easy deployment.

---

## 🏗️ Architecture

### Tech Stack
- **Backend**: FastAPI (Python 3.8+)
- **Frontend**: Next.js 15 (React 19), TailwindCSS, Shadcn UI
- **AI/ML**: InsightFace (Context-Aware Face Recognition)
- **Database**: SQLite (via `aiosqlite` for async support)
- **Orchestration**: Docker & Docker Compose
- **Package Managers**: `pip` (Backend), `bun` (Frontend)

### Project Structure
```text
drive-photo-sharing/
├── backend/            # FastAPI Application
│   ├── app/            # Core logic, API routes, and Services
│   ├── data/           # SQLite DB, uploads, and cached models
│   └── cron_worker.py  # Background sync engine
├── frontend/           # Next.js Application
│   ├── src/app/        # App Router pages
│   └── components/     # UI Design System
└── docker-compose.yml  # Orchestration
```

---

## ⚡ Quick Start

### 1. Prerequisites
- **Docker & Docker Compose** (Recommended)
- **Google Cloud Service Account** (with Drive API enabled)
- **Python 3.8+** & **Bun** (for local development)

### 2. Configure Environment
1. **Google Drive Setup**:
   - Create a Google Cloud Project.
   - Enable **Google Drive API**.
   - Create a **Service Account**, download the JSON key, and save it as `backend/data/accounts/0.json`.
   - Share your Google Drive event folder with the service account email.

2. **Backend Config**:
   Create `backend/.env` using the following variables (defaults provided):

| Variable | Description | Default / Example |
|----------|-------------|---------|
| `FACE_SIMILARITY_THRESHOLD` | Face matching threshold (0.0-1.0) | `0.6` |
| `ADMIN_PASSWORD` | Admin dashboard password | `admin123` |
| `SECRET_KEY` | JWT secret key | `ThisIsMyLongSecretKeyForJWT` |
| `DB_PATH` | Path to SQLite database | `data/app.db` |
| `SERVICE_ACCOUNTS_DIR` | Directory for JSON credentials | `data/accounts` |


3. **Frontend Config**:
   Create `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=/api
   ```

### 3. Run with Docker 🐳
```bash
# Start the entire stack
docker-compose up -d
```
The application will be available at:
- **Frontend**: `http://localhost:3005`
- **Backend API**: `http://localhost:8000`
- **Swagger Docs**: `http://localhost:8000/docs`

---

## 🛠️ Local Development

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or .\venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend Setup
```bash
cd frontend
bun install
bun run dev
```

---

## 🔐 Security & License

- **Security**: Please refer to [SECURITY.md](SECURITY.md) for vulnerability reporting.
- **License**: Distributed under the **MIT License**. See [LICENSE](LICENSE) for more information.
- **Contributing**: Contributions are what make the open-source community an amazing place. Check out [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

**Built by [Yash Oswal](https://github.com/yashoswalyo) with ❤️**
