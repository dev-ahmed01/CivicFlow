import os
import uuid
import time
import io
import math
import logging
import numpy as np
from PIL import Image
from typing import List, Tuple, Dict, Any, Optional

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    cv2 = None

from app.schemas import (
    PotholeDetection,
    NormalizedBBox,
    ImageDimensions,
    ModelMetadata
)

logger = logging.getLogger("pothole_ai.detector")

def compute_visual_severity(ratio: float) -> str:
    """Demo heuristic for visual severity candidate based on relative mask size."""
    if ratio < 0.005:
        return "LOW"
    elif ratio < 0.02:
        return "MEDIUM"
    else:
        return "HIGH"

class PotholeDetector:
    def __init__(self, model_path: str = "weights/yolov8n-seg-pothole.pt", device: str = "cpu", default_threshold: float = 0.25):
        self.model_path = model_path
        self.device = device
        self.default_threshold = default_threshold
        self.model = None
        self.is_loaded = False
        self.is_mock = False
        self.model_name = "YOLOv8-Seg-Pothole"
        self.model_version = "1.0.0"

        self._load_model()

    def _load_model(self):
        """Attempts to load Ultralytics YOLO model. Falls back to synthetic detector if missing or MOCK."""
        if self.model_path == "MOCK" or os.environ.get("POTHOLE_AI_MOCK", "").lower() in ("true", "1"):
            logger.info("Initializing PotholeDetector in MOCK mode")
            self.is_mock = True
            self.is_loaded = True
            self.model_name = "Synthetic-Pothole-Mock"
            return

        try:
            from ultralytics import YOLO
            if os.path.exists(self.model_path):
                logger.info(f"Loading YOLO model weights from {self.model_path}")
                self.model = YOLO(self.model_path)
                self.model_name = os.path.basename(self.model_path)
            else:
                logger.warning(f"Weights file '{self.model_path}' not found. Initializing fallback mock detector.")
                self.is_mock = True
                self.model_name = "Fallback-Pothole-Detector"
            self.is_loaded = True
        except Exception as e:
            logger.warning(f"Could not load Ultralytics model ({e}). Using synthetic mock detector.")
            self.is_mock = True
            self.is_loaded = True
            self.model_name = "Fallback-Synthetic-Detector"

    def detect_numpy_image(self, img_np: np.ndarray, threshold: Optional[float] = None) -> Tuple[ImageDimensions, List[PotholeDetection]]:
        """Run detection on a NumPy RGB/BGR image array."""
        if img_np is None or img_np.size == 0:
            raise ValueError("Empty or invalid image array provided")

        height, width = img_np.shape[:2]
        if height <= 0 or width <= 0:
            raise ValueError(f"Invalid image dimensions: {width}x{height}")

        conf_thresh = threshold if threshold is not None else self.default_threshold

        if self.is_mock or self.model is None:
            detections = self._run_mock_detection(img_np, width, height, conf_thresh)
        else:
            detections = self._run_yolo_detection(img_np, width, height, conf_thresh)

        return ImageDimensions(width=width, height=height), detections

    def detect_bytes(self, image_bytes: bytes, threshold: Optional[float] = None) -> Tuple[ImageDimensions, List[PotholeDetection]]:
        """Decode image bytes and run detection."""
        if not image_bytes:
            raise ValueError("Image bytes payload is empty")

        img_np = None
        if HAS_CV2:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img_np is None:
            try:
                pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                img_np = np.array(pil_img)
            except Exception as e:
                raise ValueError("Failed to decode image. File may be corrupt or an unsupported format.") from e

        return self.detect_numpy_image(img_np, threshold)

    def _run_yolo_detection(self, img_np: np.ndarray, width: int, height: int, threshold: float) -> List[PotholeDetection]:
        """Runs actual YOLOv8-seg inference on image array."""
        results = self.model.predict(
            source=img_np,
            conf=threshold,
            device=self.device,
            verbose=False
        )

        detections: List[PotholeDetection] = []
        if not results or len(results) == 0:
            return detections

        res = results[0]
        boxes = res.boxes
        masks = res.masks

        if boxes is None or len(boxes) == 0:
            return detections

        for i, box in enumerate(boxes):
            conf = float(box.conf[0].cpu().numpy())
            if conf < threshold:
                continue

            xyxy = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])

            norm_x = max(0.0, min(1.0, x1 / width))
            norm_y = max(0.0, min(1.0, y1 / height))
            norm_w = max(0.0, min(1.0, (x2 - x1) / width))
            norm_h = max(0.0, min(1.0, (y2 - y1) / height))

            polygon_pts: List[Tuple[float, float]] = []
            mask_area_pixels = (x2 - x1) * (y2 - y1)

            if masks is not None and i < len(masks.xy):
                pts = masks.xy[i]
                if len(pts) > 0:
                    pts_np = np.array(pts, dtype=np.float32)
                    if HAS_CV2:
                        epsilon = 0.005 * cv2.arcLength(pts_np.reshape(-1, 1, 2), True)
                        approx = cv2.approxPolyDP(pts_np.reshape(-1, 1, 2), epsilon, True)
                        pts_list = approx.reshape(-1, 2)
                    else:
                        pts_list = pts_np

                    for pt in pts_list:
                        px = max(0.0, min(1.0, float(pt[0]) / width))
                        py = max(0.0, min(1.0, float(pt[1]) / height))
                        polygon_pts.append((round(px, 4), round(py, 4)))

                    if hasattr(masks, 'data') and i < len(masks.data):
                        m_data = masks.data[i].cpu().numpy()
                        mask_area_pixels = float(np.sum(m_data > 0.5))

            if not polygon_pts:
                polygon_pts = [
                    (round(norm_x, 4), round(norm_y, 4)),
                    (round(norm_x + norm_w, 4), round(norm_y, 4)),
                    (round(norm_x + norm_w, 4), round(norm_y + norm_h, 4)),
                    (round(norm_x), round(norm_y + norm_h, 4))
                ]

            visible_ratio = max(0.0, min(1.0, mask_area_pixels / (width * height)))
            severity = compute_visual_severity(visible_ratio)

            det = PotholeDetection(
                detectionId=str(uuid.uuid4()),
                label="pothole",
                confidence=round(conf, 4),
                bbox=NormalizedBBox(
                    x=round(norm_x, 4),
                    y=round(norm_y, 4),
                    width=round(norm_w, 4),
                    height=round(norm_h, 4)
                ),
                polygon=polygon_pts,
                visibleAreaRatio=round(visible_ratio, 6),
                visualSeverityCandidate=severity
            )
            detections.append(det)

        return detections

    def _run_mock_detection(self, img_np: np.ndarray, width: int, height: int, threshold: float) -> List[PotholeDetection]:
        """
        Synthetic deterministic detection logic for test fixtures & offline mode.
        Detects synthetic dark region contours (drawn on test fixture road images).
        """
        detections: List[PotholeDetection] = []

        if HAS_CV2:
            gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY if img_np.ndim == 3 else cv2.COLOR_GRAY2BGR)
            _, thresh = cv2.threshold(gray, 40, 255, cv2.THRESH_BINARY_INV)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < (width * height * 0.001) or area > (width * height * 0.4):
                    continue

                x, y, w, h = cv2.boundingRect(cnt)
                norm_x = max(0.0, min(1.0, x / width))
                norm_y = max(0.0, min(1.0, y / height))
                norm_w = max(0.0, min(1.0, w / width))
                norm_h = max(0.0, min(1.0, h / height))

                epsilon = 0.01 * cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, epsilon, True)

                polygon_pts: List[Tuple[float, float]] = []
                for pt in approx.reshape(-1, 2):
                    px = max(0.0, min(1.0, float(pt[0]) / width))
                    py = max(0.0, min(1.0, float(pt[1]) / height))
                    polygon_pts.append((round(px, 4), round(py, 4)))

                if len(polygon_pts) < 3:
                    continue

                visible_ratio = max(0.0, min(1.0, float(area) / (width * height)))
                hull = cv2.convexHull(cnt)
                hull_area = cv2.contourArea(hull)
                solidity = float(area) / hull_area if hull_area > 0 else 0.8
                confidence = round(min(0.98, max(0.65, solidity * 0.95)), 4)

                if confidence < threshold:
                    continue

                severity = compute_visual_severity(visible_ratio)

                det = PotholeDetection(
                    detectionId=str(uuid.uuid4()),
                    label="pothole",
                    confidence=confidence,
                    bbox=NormalizedBBox(
                        x=round(norm_x, 4),
                        y=round(norm_y, 4),
                        width=round(norm_w, 4),
                        height=round(norm_h, 4)
                    ),
                    polygon=polygon_pts,
                    visibleAreaRatio=round(visible_ratio, 6),
                    visualSeverityCandidate=severity
                )
                detections.append(det)

        else:
            # Pure NumPy & PIL fallback contour extraction
            gray = np.mean(img_np, axis=2) if img_np.ndim == 3 else img_np
            dark_mask = gray < 40

            # Label connected components or detect bounding box
            if np.any(dark_mask):
                y_indices, x_indices = np.where(dark_mask)
                if len(x_indices) > 50:
                    min_x, max_x = int(np.min(x_indices)), int(np.max(x_indices))
                    min_y, max_y = int(np.min(y_indices)), int(np.max(y_indices))

                    w = max_x - min_x
                    h = max_y - min_y
                    area = len(x_indices)

                    if (width * height * 0.001) <= area <= (width * height * 0.4):
                        norm_x = max(0.0, min(1.0, min_x / width))
                        norm_y = max(0.0, min(1.0, min_y / height))
                        norm_w = max(0.0, min(1.0, w / width))
                        norm_h = max(0.0, min(1.0, h / height))

                        # Construct smooth oval polygon points (8 points)
                        cx_norm = norm_x + norm_w / 2.0
                        cy_norm = norm_y + norm_h / 2.0
                        rx_norm = norm_w / 2.0
                        ry_norm = norm_h / 2.0

                        polygon_pts = []
                        for angle_deg in range(0, 360, 45):
                            rad = math.radians(angle_deg)
                            px = max(0.0, min(1.0, cx_norm + rx_norm * math.cos(rad)))
                            py = max(0.0, min(1.0, cy_norm + ry_norm * math.sin(rad)))
                            polygon_pts.append((round(px, 4), round(py, 4)))

                        visible_ratio = max(0.0, min(1.0, float(area) / (width * height)))
                        confidence = 0.94

                        if confidence >= threshold:
                            severity = compute_visual_severity(visible_ratio)
                            det = PotholeDetection(
                                detectionId=str(uuid.uuid4()),
                                label="pothole",
                                confidence=confidence,
                                bbox=NormalizedBBox(
                                    x=round(norm_x, 4),
                                    y=round(norm_y, 4),
                                    width=round(norm_w, 4),
                                    height=round(norm_h, 4)
                                ),
                                polygon=polygon_pts,
                                visibleAreaRatio=round(visible_ratio, 6),
                                visualSeverityCandidate=severity
                            )
                            detections.append(det)

        return detections
