import os
import pytest
import numpy as np
from app.model.detector import PotholeDetector, compute_visual_extent
from fixtures.generate_fixtures import generate_all_fixtures

@pytest.fixture(scope="module")
def setup_fixtures(tmp_path_factory):
    fixtures_dir = tmp_path_factory.mktemp("fixtures")
    generate_all_fixtures(str(fixtures_dir))
    return fixtures_dir

def test_visual_extent_cutoff():
    assert compute_visual_extent(0.001) == "LOW"
    assert compute_visual_extent(0.0049) == "LOW"
    assert compute_visual_extent(0.005) == "MEDIUM"
    assert compute_visual_extent(0.015) == "MEDIUM"
    assert compute_visual_extent(0.02) == "HIGH"

def test_detector_demo_mode(setup_fixtures):
    detector = PotholeDetector(mode="demo")
    assert detector.is_loaded is True
    assert detector.runtime_mode == "DEMO"

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
    assert 0.0 <= det.bbox.x <= 1.0
    assert 0.0 <= det.bbox.y <= 1.0
    assert 0.0 <= det.bbox.width <= 1.0
    assert 0.0 <= det.bbox.height <= 1.0
    assert det.visualExtentCandidate in ("LOW", "MEDIUM", "HIGH")

def test_detector_real_mode_missing_weights_fails():
    detector = PotholeDetector(mode="real", model_path="weights/non_existent_weights.pt")
    assert detector.is_loaded is False
    assert detector.model is None
    assert detector.runtime_mode == "REAL"

def test_detector_large_image_downscaling():
    detector = PotholeDetector(mode="demo", max_image_dimension=1000)
    # Create large 2000x2000 image
    large_img = np.full((2000, 2000, 3), (75, 78, 82), dtype=np.uint8)

    dims, detections = detector.detect_numpy_image(large_img)
    # Original dimensions must be preserved in response
    assert dims.width == 2000
    assert dims.height == 2000

def test_detector_invalid_bytes():
    detector = PotholeDetector(mode="demo")
    with pytest.raises(ValueError, match="Failed to decode image"):
        detector.detect_bytes(b"invalid-bytes-stream")

def test_detector_real_mode_verified_weights_load():
    weights_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "weights", "yolov8n-seg-pothole.pt")
    if not os.path.exists(weights_path):
        pytest.skip("Verified YOLO weights file not found locally")

    detector = PotholeDetector(mode="real", model_path=weights_path)
    assert detector.is_loaded is True
    assert detector.runtime_mode == "REAL"
    assert detector.weights_sha256 == "04b05396b38dfe0801c3db2e4cc8c77e23b23c024a4cea37fce8295660817704"

