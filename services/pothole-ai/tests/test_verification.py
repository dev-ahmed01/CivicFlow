import pytest
from app.schemas import (
    NormalizedBBox,
    PotholeDetection,
    VerificationScanRequest
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
        visualSeverityCandidate="MEDIUM"
    )

def test_verification_defect_still_detected():
    engine = VerificationScanEngine(default_iou_threshold=0.30)
    baseline = create_det(0.40, 0.40, 0.15, 0.10, conf=0.95)
    current_scan = [create_det(0.41, 0.40, 0.14, 0.10, conf=0.88)]

    request = VerificationScanRequest(
        baselineDetection=baseline,
        currentDetections=current_scan,
        iouThreshold=0.30,
        qualityOK=True
    )

    response = engine.evaluate(request)
    assert response.verificationStatus == "DEFECT_STILL_DETECTED"
    assert response.confidence == 0.88
    assert response.matchedDetection is not None
    assert "Pothole persists" in response.reason

def test_verification_no_defect_detected():
    engine = VerificationScanEngine(default_iou_threshold=0.30)
    baseline = create_det(0.40, 0.40, 0.15, 0.10, conf=0.95)
    # Post-repair scan has 0 detections (clear road surface)
    current_scan = []

    request = VerificationScanRequest(
        baselineDetection=baseline,
        currentDetections=current_scan,
        iouThreshold=0.30,
        qualityOK=True
    )

    response = engine.evaluate(request)
    assert response.verificationStatus == "NO_MATCHING_DEFECT_DETECTED"
    assert response.matchedDetection is None
    assert "Road surface appears clear" in response.reason

def test_verification_inconclusive_due_to_quality():
    engine = VerificationScanEngine(default_iou_threshold=0.30)
    baseline = create_det(0.40, 0.40, 0.15, 0.10, conf=0.95)

    request = VerificationScanRequest(
        baselineDetection=baseline,
        currentDetections=[],
        iouThreshold=0.30,
        qualityOK=False # Camera obstructed / low light
    )

    response = engine.evaluate(request)
    assert response.verificationStatus == "INCONCLUSIVE"
    assert response.confidence == 0.0
    assert "insufficient/obstructed" in response.reason
