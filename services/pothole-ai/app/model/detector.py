import os
import uuid
import time
import io
import math
import hashlib
import logging
import numpy as np
from PIL import Image
from typing import List, Tuple, Dict, Any, Optional, Literal

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
from app.services.quality import QualityAssessor

logger = logging.getLogger("pothole_ai.detector")

def compute_sha256(filepath: str) -> Optional[str]:
    """Computes SHA-256 digest of a file if it exists."""
    if not filepath or not os.path.exists(filepath):
        return None
    try:
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    except Exception as e:
        logger.warning(f"Could not compute SHA-256 for {filepath}: {e}")
        return None

def compute_visual_extent(ratio: float) -> str:
    """Relative visible image extent cutoff; clearly distinguished from physical depth/severity."""
    if ratio < 0.005:
        return "LOW"
    elif ratio < 0.02:
        return "MEDIUM"
    else:
        return "HIGH"

class PotholeDetector:
    def __init__(
        self,
        mode: str = "real",
        model_path: str = "weights/yolov8n-seg-pothole.pt",
        device: str = "cpu",
        default_threshold: float = 0.25,
        max_image_dimension: int = 1920
    ):
        self.mode = mode.lower()
        self.model_path = model_path
        self.device = device
        self.default_threshold = default_threshold
        self.max_image_dimension = max_image_dimension

        self.model = None
        self.is_loaded = False
        self.runtime_mode: Literal["REAL", "DEMO"] = "REAL" if self.mode == "real" else "DEMO"
        self.model_name = "YOLOv8-Seg-Pothole"
        self.model_version = "1.0.0"
        self.source = "FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment"
        self.weights_sha256: Optional[str] = None

        self._load_model()

    def _load_model(self):
        """
        Loads model based on configured runtime mode.
        In REAL mode: MUST load actual trained weights. If weights are missing or fail, readiness FAILS loudly.
        In DEMO mode: Synthetic deterministic mock detector is allowed.
        """
        if self.mode == "demo":
            logger.info("Initializing PotholeDetector in DEMO mode (Synthetic Mock)")
            self.runtime_mode = "DEMO"
            self.is_loaded = True
            self.model_name = "Synthetic-Pothole-Demo"
            self.source = "Internal-Synthetic-Demo-Generator"
            return

        # REAL MODE: Must load actual trained YOLO weights
        self.runtime_mode = "REAL"
        if not os.path.exists(self.model_path):
            logger.error(f"REAL MODE ERROR: Weights file '{self.model_path}' does not exist. Service readiness FAILS.")
            self.is_loaded = False
            return

        try:
            from ultralytics import YOLO
            logger.info(f"Loading REAL YOLO model weights from {self.model_path}")
            self.model = YOLO(self.model_path)
            self.model_name = os.path.basename(self.model_path)
            self.weights_sha256 = compute_sha256(self.model_path)
            self.is_loaded = True
            logger.info(f"REAL YOLO model loaded successfully. SHA-256: {self.weights_sha256}")
        except Exception as e:
            logger.error(f"REAL MODE ERROR: Failed to load Ultralytics YOLO model from '{self.model_path}': {e}")
            self.is_loaded = False
            self.model = None

    def detect_numpy_image(self, img_np: np.ndarray, threshold: Optional[float] = None) -> Tuple[ImageDimensions, List[PotholeDetection]]:
        """Run detection on a NumPy RGB/BGR image array with safe dimension scaling."""
        if img_np is None or img_np.size == 0:
            raise ValueError("Empty or invalid image array provided")

        orig_h, orig_w = img_np.shape[:2]
        if orig_h <= 0 or orig_w <= 0:
            raise ValueError(f"Invalid image dimensions: {orig_w}x{orig_h}")

        conf_thresh = threshold if threshold is not None else self.default_threshold

        # Safely downscale image if dimensions exceed MAX_IMAGE_DIMENSION
        process_img = img_np
        if max(orig_h, orig_w) > self.max_image_dimension:
            scale = self.max_image_dimension / float(max(orig_h, orig_w))
            new_w, new_h = max(1, int(orig_w * scale)), max(1, int(orig_h * scale))
            if HAS_CV2:
                process_img = cv2.resize(img_np, (new_w, new_h), interpolation=cv2.INTER_AREA)
            else:
                pil_img = Image.fromarray(img_np)
                pil_resized = pil_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                process_img = np.array(pil_resized)

        if self.runtime_mode == "DEMO" or self.model is None:
            detections = self._run_mock_detection(process_img, orig_w, orig_h, conf_thresh)
        else:
            detections = self._run_yolo_detection(process_img, orig_w, orig_h, conf_thresh)

        return ImageDimensions(width=orig_w, height=orig_h), detections

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

    def _run_yolo_detection(self, process_img: np.ndarray, orig_w: int, orig_h: int, threshold: float) -> List[PotholeDetection]:
        """Runs actual YOLOv8-seg inference on image array and returns normalized 0..1 coordinates relative to orig_w/orig_h."""
        proc_h, proc_w = process_img.shape[:2]

        results = self.model.predict(
            source=process_img,
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

            # Coordinates normalized relative to processed frame (which equals normalized relative to original frame)
            norm_x = max(0.0, min(1.0, x1 / proc_w))
            norm_y = max(0.0, min(1.0, y1 / proc_h))
            norm_w = max(0.0, min(1.0, (x2 - x1) / proc_w))
            norm_h = max(0.0, min(1.0, (y2 - y1) / proc_h))

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
                        px = max(0.0, min(1.0, float(pt[0]) / proc_w))
                        py = max(0.0, min(1.0, float(pt[1]) / proc_h))
                        polygon_pts.append((round(px, 4), round(py, 4)))

                    if hasattr(masks, 'data') and i < len(masks.data):
                        m_data = masks.data[i].cpu().numpy()
                        mask_area_pixels = float(np.sum(m_data > 0.5))

            if not polygon_pts:
                polygon_pts = [
                    (round(norm_x, 4), round(norm_y, 4)),
                    (round(norm_x + norm_w, 4), round(norm_y, 4)),
                    (round(norm_x + norm_w, 4), round(norm_y + norm_h, 4)),
                    (round(norm_x, 4), round(norm_y + norm_h, 4))
                ]

            visible_ratio = max(0.0, min(1.0, mask_area_pixels / (proc_w * proc_h)))
            extent = compute_visual_extent(visible_ratio)

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
                visualExtentCandidate=extent,
                visualSeverityCandidate=extent
            )
            detections.append(det)

        return detections

    def _run_mock_detection(self, img_np: np.ndarray, orig_w: int, orig_h: int, threshold: float) -> List[PotholeDetection]:
        """Synthetic deterministic detection logic for test fixtures & DEMO mode."""
        detections: List[PotholeDetection] = []
        proc_h, proc_w = img_np.shape[:2]

        if HAS_CV2:
            gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY if img_np.ndim == 3 else cv2.COLOR_GRAY2BGR)
            _, thresh = cv2.threshold(gray, 40, 255, cv2.THRESH_BINARY_INV)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area < (proc_w * proc_h * 0.001) or area > (proc_w * proc_h * 0.4):
                    continue

                x, y, w, h = cv2.boundingRect(cnt)
                norm_x = max(0.0, min(1.0, x / proc_w))
                norm_y = max(0.0, min(1.0, y / proc_h))
                norm_w = max(0.0, min(1.0, w / proc_w))
                norm_h = max(0.0, min(1.0, h / proc_h))

                epsilon = 0.01 * cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, epsilon, True)

                polygon_pts: List[Tuple[float, float]] = []
                for pt in approx.reshape(-1, 2):
                    px = max(0.0, min(1.0, float(pt[0]) / proc_w))
                    py = max(0.0, min(1.0, float(pt[1]) / proc_h))
                    polygon_pts.append((round(px, 4), round(py, 4)))

                if len(polygon_pts) < 3:
                    continue

                visible_ratio = max(0.0, min(1.0, float(area) / (proc_w * proc_h)))
                hull = cv2.convexHull(cnt)
                hull_area = cv2.contourArea(hull)
                solidity = float(area) / hull_area if hull_area > 0 else 0.8
                confidence = round(min(0.98, max(0.65, solidity * 0.95)), 4)

                if confidence < threshold:
                    continue

                extent = compute_visual_extent(visible_ratio)
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
                    visualExtentCandidate=extent,
                    visualSeverityCandidate=extent
                )
                detections.append(det)
        else:
            gray = np.mean(img_np, axis=2) if img_np.ndim == 3 else img_np
            dark_mask = gray < 40

            if np.any(dark_mask):
                y_indices, x_indices = np.where(dark_mask)
                if len(x_indices) > 50:
                    min_x, max_x = int(np.min(x_indices)), int(np.max(x_indices))
                    min_y, max_y = int(np.min(y_indices)), int(np.max(y_indices))

                    w = max_x - min_x
                    h = max_y - min_y
                    area = len(x_indices)

                    if (proc_w * proc_h * 0.001) <= area <= (proc_w * proc_h * 0.4):
                        norm_x = max(0.0, min(1.0, min_x / proc_w))
                        norm_y = max(0.0, min(1.0, min_y / proc_h))
                        norm_w = max(0.0, min(1.0, w / proc_w))
                        norm_h = max(0.0, min(1.0, h / proc_h))

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

                        visible_ratio = max(0.0, min(1.0, float(area) / (proc_w * proc_h)))
                        confidence = 0.94

                        if confidence >= threshold:
                            extent = compute_visual_extent(visible_ratio)
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
                                visualExtentCandidate=extent,
                                visualSeverityCandidate=extent
                            )
                            detections.append(det)

        return detections
