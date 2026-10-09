# 🎨 PICSHARE Frontend Application

The modern, responsive web client for PICSHARE, built with **Next.js 16 (App Router)**, **React 19**, **TailwindCSS**, and **Lucide Icons**.

---

## 🌟 Key Architecture & Features

### 1. Public Event Gallery (`src/components/event-gallery-client.tsx`)
- **♾️ Auto-Load Infinite Scrolling**:
  - Replaces manual "Load More" pagination with an automated `IntersectionObserver` sentinel.
  - Pre-fetches the next photo batch 350px before reaching the bottom for zero-interruption scrolling.
  - Displays a live remaining count pill: `{remaining} photos remaining • Auto-loading as you scroll`, loading spinner, and completion badges (`All {total} photos loaded ✓`).
  - Concurrency locks (`useRef`) and ID deduplication prevent duplicate cards during fast scrolls.
- **🔒 Public vs. Private Gallery Modes**:
  - Respects the host's `allow_public_gallery` setting.
  - When disabled, unauthenticated public browsing is restricted; guests are presented with an elegant "Private Gallery • Face Match Only" screen that prompts them to take a selfie.
  - Guests only see photos matching their own facial recognition scans.
- **📸 In-Browser AI Selfie Matching**:
  - Built-in webcam capture and file upload with client-side canvas compression (`src/lib/image-compressor.ts`).
  - Compresses heavy mobile/DSLR selfies down to ~200–400 KB before uploading to InsightFace, eliminating 413 payload errors.
- **🗂️ Multi-Select & Floating Bulk ZIP Dock**:
  - Top-left selection checkboxes on every photo card.
  - Glassmorphism action dock with `Select All`, `Deselect All`, counter badges, and single-click `Download Selected ZIP`.
- **🔐 Passcode Protection**:
  - Client-side session storage caching for passcode-protected events with seamless verification forms.

---

### 2. Admin Dashboard (`src/components/admin-dashboard-client.tsx`)
- **📁 In-App Server Directory Browser**:
  - Visual folder picker modal for local storage paths with full breadcrumb navigation starting from host `/home` (mounted as `/home:ro`).
  - Real-time search/filtering, directory child counts, and single-click path selection.
- **👁️ 1-Click Public All-Photos Visibility Toggle**:
  - Dedicated toggle switch on every event card to toggle between **All Photos Visible** (public) and **Selfie Matches Only** (private events).
  - Also configurable during new event creation.
- **📊 Real-Time Storage Breakdown**:
  - Visual analytics comparing local SSD previews and thumbnails against cloud storage usage.
- **👥 Guest Management**:
  - View guest scan history, matched photo counts, and trigger re-scans.
- **🔄 Sync Management**:
  - Trigger one-click background syncs and monitor live indexing progress.

---

### 3. Lightbox Modal (`src/components/photo-lightbox-modal.tsx`)
- High-performance fullscreen modal powered by `react-zoom-pan-pinch`.
- Touch swipe gestures, mouse panning, and keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`).
- Instant 2K WebP preview rendering with single-click download actions.

---

## 🛠️ Local Development

### Prerequisites
- **Bun** (Recommended) or **Node.js 20+**

### Installation
```bash
cd frontend
bun install
```

### Environment Configuration
Create `.env.local` in the `frontend` directory:
```env
NEXT_PUBLIC_API_URL=/api
```

### Run Development Server
```bash
bun run dev
```
Open [http://localhost:3000](http://localhost:3000) (or [http://localhost:3005](http://localhost:3005) when running in Docker).

### Build for Production
```bash
bun run build
```

---

## 🐳 Docker Production Setup
The frontend runs as a multi-stage Alpine Docker container configured in root `docker-compose.yml`, listening on port `3005`:
```bash
# From project root
docker compose up -d frontend
```
