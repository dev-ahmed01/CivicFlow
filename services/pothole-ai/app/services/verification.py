import logging
from typing import Optional, List
from app.schemas import (
    PotholeDetection,
    VerificationScanRequest,
    VerificationScanResponse,
    FrameDetectionInput
)
from app.services.temporal import calculate_bbox_iou
from app.services.quality import QualityAssessor

logger = logging.getLogger("pothole_ai.verification")

class VerificationScanEngine:
    def __init__(
        self,
        default_iou_threshold: float = 0.30,
        min_confidence: float = 0.30,
        min_usable_frames: int = 3
    ):
        self.default_iou_threshold = default_iou_threshold
        self.min_confidence = min_confidence
        self.min_usable_frames = min_usable_frames
        self.quality_assessor = QualityAssessor()

    def evaluate(self, request: VerificationScanRequest) -> VerificationScanResponse:
        """
        Evaluates post-repair verification scan across multiple frames against pre-repair baseline detection.
        Determines if original pothole defect remains, is resolved, or if test is inconclusive.
        """
        # 1. Camera ID Mismatch Check
        if request.baselineCameraId and request.currentCameraId != request.baselineCameraId:
            return VerificationScanResponse(
                verificationStatus="INCONCLUSIVE",
                evidenceScore=0.0,
                reason=f"Camera mismatch: baseline camera '{request.baselineCameraId}' does not match verification camera '{request.currentCameraId}'.",
                usableFramesProcessed=0,
                totalFramesProcessed=len(request.currentFrames),
                matchedDetection=None
            )

        baseline = request.baselineDetection
        iou_thresh = request.iouThreshold if request.iouThreshold is not None else self.default_iou_threshold
        min_usable = request.minUsableFrames if request.minUsableFrames is not None else self.min_usable_frames

        total_frames = len(request.currentFrames)
        usable_frames: List[FrameDetectionInput] = []

        # 2. Assess Frame Quality
        for frame in request.currentFrames:
            if frame.frameQuality is not None:
                if frame.frameQuality.usable:
                    usable_frames.append(frame)
            else:
                # If frameQuality not pre-computed, assume usable unless empty
                usable_frames.append(frame)

        usable_count = len(usable_frames)

        # 3. Insufficient Usable Frames Check
        if usable_count < min_usable:
            return VerificationScanResponse(
                verificationStatus="INCONCLUSIVE",
                evidenceScore=0.0,
                reason=f"Insufficient usable verification frames ({usable_count} usable < required {min_usable}). Scans may be blurry, dark, or obstructed.",
                usableFramesProcessed=usable_count,
                totalFramesProcessed=total_frames,
                matchedDetection=None
            )

        # 4. Search for Overlapping Defects across Usable Frames
        best_match: Optional[PotholeDetection] = None
        best_iou: float = 0.0
        matching_frame_indices = set()

        for frame in usable_frames:
            for det in frame.detections:
                if det.confidence < self.min_confidence:
                    continue
                iou = calculate_bbox_iou(baseline.bbox, det.bbox)
                if iou >= iou_thresh:
                    matching_frame_indices.add(frame.frameIndex)
                    if iou > best_iou:
                        best_iou = iou
                        best_match = det

        matching_frame_count = len(matching_frame_indices)

        # 5. Determine Verification Result
        if best_match is not None and matching_frame_count >= 1:
            return VerificationScanResponse(
                verificationStatus="DEFECT_STILL_DETECTED",
                evidenceScore=round(best_match.confidence, 4),
                reason=f"Matching defect detected in baseline ROI across {matching_frame_count} usable frame(s) (Max IoU: {best_iou:.2f}, Confidence: {best_match.confidence:.2f}). Pothole persists.",
                usableFramesProcessed=usable_count,
                totalFramesProcessed=total_frames,
                matchedDetection=best_match
            )

        # 6. Clear Road Verification (Deterministic evidence score based on usable frame count)
        evidence_score = round(min(1.0, usable_count / 5.0), 2)
        return VerificationScanResponse(
            verificationStatus="NO_MATCHING_DEFECT_DETECTED",
            evidenceScore=evidence_score,
            reason=f"No matching defect detected within baseline ROI across {usable_count} clear usable frame(s). Road surface appears clear.",
            usableFramesProcessed=usable_count,
            totalFramesProcessed=total_frames,
            matchedDetection=None
        )
