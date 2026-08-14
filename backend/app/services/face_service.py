import cv2
import numpy as np
import insightface
from insightface.app import FaceAnalysis
from app.core.config import get_settings

settings = get_settings()


class FaceService:

    def __init__(self):
        self.app = None

    def _ensure_initialized(self):
        if self.app is None:
            # Initialize with CPUExecutionProvider
            self.app = FaceAnalysis(name='buffalo_l',
                                    providers=['CPUExecutionProvider'],
                                    root=settings.FACE_MODEL_ROOT)
            try:
                self.app.prepare(ctx_id=-1, det_size=(640, 640))
            except Exception as e:
                print(f"InsightFace CPU prepare fallback: {e}")
                self.app.prepare(ctx_id=0, det_size=(640, 640))

    def get_embeddings(self, image_path: str):
        """Detects faces and returns a list of dictionaries containing embeddings and bboxes."""
        try:
            self._ensure_initialized()
            
            # Robust image reading with OpenCV (handles UTF-8 paths)
            img = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                img = cv2.imread(image_path)
            if img is None:
                return []

            faces = self.app.get(img)
            if not faces:
                return []

            results = []
            for face in faces:
                results.append({
                    "embedding": face.normed_embedding.tolist() if hasattr(face.normed_embedding, "tolist") else face.normed_embedding,
                    "bbox": face.bbox.tolist() if hasattr(face.bbox, "tolist") else face.bbox,  # [x1, y1, x2, y2]
                    "score": float(face.det_score) if hasattr(face, "det_score") else 1.0
                })
            return results
        except Exception as e:
            print(f"Face extraction encountered non-fatal error: {e}")
            return []

    def compute_similarity(self, embedding1, embedding2):
        """Cosine similarity between two embeddings."""
        embedding1 = np.array(embedding1)
        embedding2 = np.array(embedding2)
        norm1 = np.linalg.norm(embedding1)
        norm2 = np.linalg.norm(embedding2)
        if norm1 == 0 or norm2 == 0:
            return 0.0
        return float(np.dot(embedding1, embedding2) / (norm1 * norm2))


face_service = FaceService()
