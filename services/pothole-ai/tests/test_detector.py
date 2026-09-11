import os
import pytest
import numpy as np
import cv2
from app.model.detector import PotholeDetector, compute_visual_severity
from fixtures.generate_fixtures import generate_all_fixtures

@pytest.fixture(scope="module")
def setup_fixtures(tmp_path_factory):
    fixtures_dir = tmp_path_factory.mktemp("fixtures")
    generate_all_fixtures(str(fixtures_dir))
    return fixtures_dir

def test_visual_severity_heuristic():
    assert compute_visual_severity(0.001) == "LOW"
    assert compute_visual_severity(0.0049) == "LOW"
    assert compute_visual_severity(0.005) == "MEDIUM"
    assert compute_visual_severity(0.015) == "MEDIUM"
    assert compute_visual_severity(0.02) == "HIGH"
    assert compute_visual_severity(0.05) == "HIGH"

def test_detector_mock_single_pothole(setup_fixtures):
    detector = PotholeDetector(model_path="MOCK")
    assert detector.is_loaded is True

    img_path = os.path.join(setup_fixtures, "cam_01_single_pothole.jpg")
    with open(img_path, "rb") as f:
        image_bytes = f.read()

    img_dims, detections = detector.detect_bytes(image_bytes)

    assert img_dims.width == 1280
    assert img_dims.height == 720
    assert len(detections) >= 1

    det = detections[0]
    assert det.label == "pothole"
    assert 0.0 <= det.confidence <= 1.0

    # Verify 0..1 normalization
    assert 0.0 <= det.bbox.x <= 1.0
    assert 0.0 <= det.bbox.y <= 1.0
    assert 0.0 <= det.bbox.width <= 1.0
    assert 0.0 <= det.bbox.height <= 1.0

    for pt in det.polygon:
        assert 0.0 <= pt[0] <= 1.0
        assert 0.0 <= pt[1] <= 1.0

    assert 0.0 <= det.visibleAreaRatio <= 1.0
    assert det.visualSeverityCandidate in ("LOW", "MEDIUM", "HIGH")

def test_detector_mock_clear_road(setup_fixtures):
    detector = PotholeDetector(model_path="MOCK")
    img_path = os.path.join(setup_fixtures, "cam_03_clear_road.jpg")
    with open(img_path, "rb") as f:
        image_bytes = f.read()

    img_dims, detections = detector.detect_bytes(image_bytes)
    assert len(detections) == 0

def test_detector_invalid_bytes():
    detector = PotholeDetector(model_path="MOCK")
    with pytest.raises(ValueError, match="Failed to decode image"):
        detector.detect_bytes(b"not-an-image-data-payload")

def test_detector_empty_bytes():
    detector = PotholeDetector(model_path="MOCK")
    with pytest.raises(ValueError, match="Image bytes payload is empty"):
        detector.detect_bytes(b"")
