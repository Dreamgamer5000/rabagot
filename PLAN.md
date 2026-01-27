## Build a full-stack system to share wedding photos privately using face recognition and Google Drive storage.

The frontend must use **Bun / bunx** instead of Node / npx.
The backend must be **Python-only**.

## Core Requirements
### 1. Admin Flow

- Admin creates an event (name, date, slug).
- Admin uploads 6,000+ original photos.
- Photos are pre-compressed manually before upload (HQ versions only).
- For each photo:
    - Upload original to Google Drive inside folder:
    `Events/{event_slug}/All-Photos`
    - Store returned drive_file_id in MongoDB.
    - Generate a thumbnail (256px or 512px) inside backend.
    - Save thumbnail locally to `/thumbnails/{photo_id}.jpg`.
    - Extract all faces using a face recognition model.
    - Store:
        - Face embeddings
        - Bounding boxes
        - Photo ID reference

### 2. Guest Flow (Phase 1: Drive Folder Delivery)

- Guest visits event link: `/event/{slug}`.
- Guest enters:
    - Name
    - Email
    - Phone (optional)
- Guest uploads a selfie.
- Backend:
    - Generates face embedding for selfie.
    - Matches against stored face embeddings.
    - Collects matching photo IDs above a similarity threshold.
    - Deduplicates results.
    - Caps to top 50–150 matches.
    - Creates a Google Drive folder:
    `Events/{event_slug}/Guests/{guest_name}`
    - Creates shortcuts inside guest folder pointing to matching photos.
    - Shares guest folder with guest email (read-only).
- Frontend shows:
    - “Your photos are ready”
    - Drive folder link
    - Confirmation that the link was emailed.

### 3. Future-Ready Design (Do Not Build Yet, But Store Data)

- Store:
    - Thumbnail paths
    - Image width & height
    - Face bounding boxes
    - Similarity scores
- Prepare DB for:
    - Guest gallery UI
    - Download selected
    - Download all
    - Face highlight overlays

### Tech Stack Constraints

#### Frontend

- Framework: React or Next.js
- Package manager: Bun
- CLI tooling: bunx

#### Backend

- Language: Python
- Framework: FastAPI
- Face recognition: InsightFace / FaceNet / DeepFace (offline)
- Thumbnails: Pillow
- Storage: Google Drive API via service account
- Database: MongoDB Atlas

#### MongoDB Collections

events
```json
{
  "_id": ObjectId,
  "name": String,
  "slug": String,
  "date": Date,
  "created_at": Date
}
```

photos
```json
{
  "_id": ObjectId,
  "event_id": ObjectId,
  "drive_file_id": String,
  "original_file_name": String,
  "thumbnail_path": String,
  "width": Number,
  "height": Number,
  "faces_count": Number,
  "created_at": Date
}
```

faces
```json
{
  "_id": ObjectId,
  "photo_id": ObjectId,
  "embedding_vector": [Number],
  "bounding_box": {
    "x": Number,
    "y": Number,
    "w": Number,
    "h": Number
  },
  "created_at": Date
}
```

guests
```json
{
  "_id": ObjectId,
  "event_id": ObjectId,
  "name": String,
  "email": String,
  "phone": String,
  "selfie_path": String,
  "guest_folder_id": String,
  "drive_folder_link": String,
  "created_at": Date
}
```

guests
```json
{
  "_id": ObjectId,
  "guest_request_id": ObjectId,
  "photo_id": ObjectId,
  "similarity_score": Number
}
```

### Drive API Behavior
- Create event folder if not exists.
- Upload originals to All-Photos folder.
- Create guest folders under Guests folder.
- Create shortcuts (not copies) for matched photos.
- Share guest folder with guest email.

### Matching Rules
- Cosine similarity threshold (default: 0.6–0.7).
- Deduplicate photo IDs.
- Cap results to top N matches.
- Store similarity scores.

### Safety & UX Rules
- Rate limit guest requests per email / IP.
- Reuse guest folder if same email uploads again.
- Fallback: if no matches found, show friendly error.
- Log all Drive API operations.

### Output Expectations
- REST APIs for:
    - Create event
    - Upload photos
    - Upload selfie
    - Match faces
    - Create Drive folders & shortcuts
- Modular services:
    - DriveService (Python)
    - FaceService (Python)
    - ThumbnailService (Python)
- MongoDB connection layer
- DB initialization scripts
- Clear backend project structure

### Important
- Phase 1 must only return Drive folder links.
- Phase 2 gallery UI will be built later using stored thumbnails.
- All frontend tooling must use Bun / bunx (not Node / npx).
- All backend logic must be implemented in Python.