import logging
import numpy as np
from typing import List, Tuple
from app.schemas import FrameQualityInfo

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False
    cv2 = None

logger = logging.getLogger("pothole_ai.quality")

class QualityAssessor:
    def __init__(
        self,
        min_blur_score: float = 50.0,
        min_brightness: float = 0.15,
        max_brightness: float = 0.90
    ):
        self.min_blur_score = min_blur_score
        self.min_brightness = min_brightness
        self.max_brightness = max_brightness

    def assess_image(self, img_np: np.ndarray) -> FrameQualityInfo:
        """
        Calculates blur variance and luminance brightness scores for a frame.
        Determines usability and reports quality issues.
        """
        if img_np is None or img_np.size == 0:
            return FrameQualityInfo(
                usable=False,
                blurScore=0.0,
                brightnessScore=0.0,
                reasons=["INVALID_IMAGE"]
            )

        # Convert image to grayscale for quality assessment
        if img_np.ndim == 3:
            if HAS_CV2:
                gray = cv2.cvtColor(img_np, cv2.COLOR_BGR2GRAY)
            else:
                gray = np.mean(img_np, axis=2)
        else:
            gray = img_np.astype(np.float32)

        # 1. Blur Score calculation
        if HAS_CV2:
            blur_score = float(cv2.Laplacian(gray.astype(np.uint8), cv2.CV_64F).var())
        else:
            # Gradient variance fallback via NumPy
            gy, gx = np.gradient(gray)
            gnorm = np.sqrt(gx**2 + gy**2)
            blur_score = float(np.var(gnorm) * 10.0)

        # 2. Brightness Score calculation (0.0 to 1.0)
        brightness_score = float(np.mean(gray)) / 255.0

        reasons: List[str] = []
        if blur_score < self.min_blur_score:
            reasons.append("TOO_BLURRY")
        if brightness_score < self.min_brightness:
            reasons.append("TOO_DARK")
        elif brightness_score > self.max_brightness:
            reasons.append("OVEREXPOSED")

        usable = len(reasons) == 0

        return FrameQualityInfo(
            usable=usable,
            blurScore=round(blur_score, 2),
            brightnessScore=round(brightness_score, 4),
            reasons=reasons
        )
