import pytest
from app.schemas import (
    NormalizedBBox,
    PotholeDetection,
    VerificationScanRequest,
    FrameDetectionInput,
    FrameQualityInfo
)
from app.services.verification import VerificationScanEngine

def create_det(x: float, y: float, w: float, h: float, conf: float = 0.90) -> PotholeDetection:
    return PotholeDetection(
        detectionId="det-test",
        label="pothole",
        confidence=conf,
        bbox=NormalizedBBox(x=x, y=y, width=w, height=h),
        polygon=[(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        visibleAreaRatio=w * h,
        visualExtentCandidate="MEDIUM",
        visualSeverityCandidate="MEDIUM"
    )

def test_verification_defect_still_detected():
    engine = VerificationScanEngine(default_iou_threshold=0.30, min_usable_frames=3)
    baseline = create_det(0.40, 0.40, 0.15, 0.10, conf=0.95)

    usable_quality = FrameQualityInfo(usable=True, blurScore=150.0, brightnessScore=0.50, reasons=[])

    verification_frames = [
        FrameDetectionInput(frameIndex=1, timestampSec=1.0, cameraId="CAM-01", frameQuality=usable_quality, detections=[create_det(0.41, 0.40, 0.14, 0.10, conf=0.88)]),
        FrameDetectionInput(frameIndex=2, timestampSec=2.0, cameraId="CAM-01", frameQuality=usable_quality, detections=[create_det(0.40, 0.41, 0.14, 0.10, conf=0.90)]),
        FrameDetectionInput(frameIndex=3, timestampSec=3.0, cameraId="CAM-01", frameQuality=usable_quality, detections=[create_det(0.41, 0.41, 0.14, 0.10, conf=0.87)])
    ]

    request = VerificationScanRequest(
        baselineDetection=baseline,
        baselineCameraId="CAM-01",
        currentCameraId="CAM-01",
        currentFrames=verification_frames,
        iouThreshold=0.30,
        minUsableFrames=3
    )

    response = engine.evaluate(request)
    assert response.verificationStatus == "DEFECT_STILL_DETECTED"
    assert response.evidenceScore > 0.80
    assert response.matchedDetection is not None
    assert "Pothole persists" in response.reason

def test_verification_no_defect_detected_with_usable_frames():
    engine = VerificationScanEngine(default_iou_threshold=0.30, min_usable_frames=3)
    baseline = create_det(0.40, 0.40, 0.15, 0.10, conf=0.95)

    usable_quality = FrameQualityInfo(usable=True, blurScore=150.0, brightnessScore=0.50, reasons=[])

    # 5 usable clear frames with ZERO matching pothole detections
    verification_frames = [
        FrameDetectionInput(frameIndex=i, timestampSec=float(i), cameraId="CAM-01", frameQuality=usable_quality, detections=[])
        for i in range(1, 6)
    ]

    request = VerificationScanRequest(
        baselineDetection=baseline,
        baselineCameraId="CAM-01",
        currentCameraId="CAM-01",
        currentFrames=verification_frames,
        iouThreshold=0.30,
        minUsableFrames=3
    )

    response = engine.evaluate(request)
    assert response.verificationStatus == "NO_MATCHING_DEFECT_DETECTED"
    assert response.evidenceScore == 1.0  # 5usable / 5 = 1.0 evidence score
    assert response.matchedDetection is None
    assert "Road surface appears clear" in response.reason

def test_verification_inconclusive_insufficient_usable_frames():
    engine = VerificationScanEngine(default_iou_threshold=0.30, min_usable_frames=3)
    baseline = create_det(0.40, 0.40, 0.15, 0.10, conf=0.95)

    unusable_quality = FrameQualityInfo(usable=False, blurScore=10.0, brightnessScore=0.05, reasons=["TOO_BLURRY", "TOO_DARK"])

    # 3 frames, but all 3 are unusable due to blur/darkness
    verification_frames = [
        FrameDetectionInput(frameIndex=i, timestampSec=float(i), cameraId="CAM-01", frameQuality=unusable_quality, detections=[])
        for i in range(1, 4)
    ]

    request = VerificationScanRequest(
        baselineDetection=baseline,
        baselineCameraId="CAM-01",
        currentCameraId="CAM-01",
        currentFrames=verification_frames,
        iouThreshold=0.30,
        minUsableFrames=3
    )

    response = engine.evaluate(request)
    assert response.verificationStatus == "INCONCLUSIVE"
    assert response.evidenceScore == 0.0
    assert "Insufficient usable verification frames" in response.reason

def test_verification_camera_mismatch_inconclusive():
    engine = VerificationScanEngine(default_iou_threshold=0.30, min_usable_frames=3)
    baseline = create_det(0.40, 0.40, 0.15, 0.10, conf=0.95)

    request = VerificationScanRequest(
        baselineDetection=baseline,
        baselineCameraId="CAM-01",
        currentCameraId="CAM-02",  # Mismatched camera ID
        currentFrames=[],
        iouThreshold=0.30,
        minUsableFrames=3
    )

    response = engine.evaluate(request)
    assert response.verificationStatus == "INCONCLUSIVE"
    assert "Camera mismatch" in response.reason
