import logging
from typing import Optional, List
from app.schemas import (
    PotholeDetection,
    VerificationScanRequest,
    VerificationScanResponse
)
from app.services.temporal import calculate_bbox_iou

logger = logging.getLogger("pothole_ai.verification")

class VerificationScanEngine:
    def __init__(self, default_iou_threshold: float = 0.30):
        self.default_iou_threshold = default_iou_threshold

    def evaluate(self, request: VerificationScanRequest) -> VerificationScanResponse:
        """
        Evaluates post-repair verification scan against pre-repair baseline detection.
        Determines if original pothole defect remains, is resolved, or if test is inconclusive.
        """
        # 1. Quality & Obstruction check
        if not request.qualityOK:
            return VerificationScanResponse(
                verificationStatus="INCONCLUSIVE",
                confidence=0.0,
                reason="Verification scan aborted: image quality, lighting, or angle is marked insufficient/obstructed.",
                matchedDetection=None
            )

        baseline = request.baselineDetection
        iou_thresh = request.iouThreshold if request.iouThreshold is not None else self.default_default_iou_threshold

        best_match: Optional[PotholeDetection] = None
        best_iou: float = 0.0

        for current_det in request.currentDetections:
            iou = calculate_bbox_iou(baseline.bbox, current_det.bbox)
            if iou > best_iou:
                best_iou = iou
                best_match = current_det

        if best_match is not None and best_iou >= iou_thresh:
            return VerificationScanResponse(
                verificationStatus="DEFECT_STILL_DETECTED",
                confidence=round(best_match.confidence, 4),
                reason=f"Matching defect detected in baseline ROI (IoU: {best_iou:.2f}, Confidence: {best_match.confidence:.2f}). Pothole persists.",
                matchedDetection=best_match
            )

        # 2. No matching defect detected in baseline ROI
        return VerificationScanResponse(
            verificationStatus="NO_MATCHING_DEFECT_DETECTED",
            confidence=0.90,
            reason=f"No matching defect detected within baseline ROI (Max IoU: {best_iou:.2f} < threshold {iou_thresh:.2f}). Road surface appears clear.",
            matchedDetection=None
        )
