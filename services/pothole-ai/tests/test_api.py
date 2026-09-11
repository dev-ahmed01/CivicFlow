import os
import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings
from fixtures.generate_fixtures import generate_all_fixtures

@pytest.fixture(scope="module", autouse=True)
def configure_test_env(tmp_path_factory):
    # Set mode to demo for test client fixture
    settings.pothole_ai_mode = "demo"
    settings.pothole_ai_internal_token = "explicit-local-test-token-not-for-deployment"
    fixtures_dir = tmp_path_factory.mktemp("fixtures")
    generate_all_fixtures(str(fixtures_dir))
    return fixtures_dir

@pytest.fixture
def client(configure_test_env):
    settings.pothole_ai_mode = "demo"
    with TestClient(app) as test_client:
        yield test_client, configure_test_env

def test_real_mode_missing_weights_fails_readiness(configure_test_env):
    original_mode = settings.pothole_ai_mode
    original_path = settings.model_path
    try:
        settings.pothole_ai_mode = "real"
        settings.model_path = "weights/missing_weights.pt"
        with TestClient(app) as test_client:
            res = test_client.get("/health")
            assert res.status_code == 503
            data = res.json()
            assert data["status"] == "unhealthy"
            assert data["runtimeMode"] == "REAL"
            assert data["modelLoaded"] is False
    finally:
        settings.pothole_ai_mode = original_mode
        settings.model_path = original_path

def test_health_check_unauthenticated(client):
    test_client, _ = client
    response = test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["contractVersion"] == "1.0"
    assert data["status"] == "ok"
    assert data["runtimeMode"] == "DEMO"
    assert data["modelLoaded"] is True

def test_internal_token_auth(client):
    test_client, fixtures_dir = client
    img_path = os.path.join(fixtures_dir, "cam_01_single_pothole.jpg")
    headers = {"X-Internal-Token": settings.pothole_ai_internal_token}

    # 1. Without Token Header -> 401
    with open(img_path, "rb") as f:
        res_no_token = test_client.post(
            "/v1/detect/image",
            files={"image": ("cam_01.jpg", f, "image/jpeg")}
        )
    assert res_no_token.status_code == 401

    # 2. Wrong Token Header -> 401
    with open(img_path, "rb") as f:
        res_bad_token = test_client.post(
            "/v1/detect/image",
            headers={"X-Internal-Token": "wrong-secret-token"},
            files={"image": ("cam_01.jpg", f, "image/jpeg")}
        )
    assert res_bad_token.status_code == 401

    # 3. Correct Token Header -> 200
    with open(img_path, "rb") as f:
        res_auth = test_client.post(
            "/v1/detect/image",
            headers=headers,
            files={"image": ("cam_01.jpg", f, "image/jpeg")},
            data={"camera_id": "CAM-001"}
        )
    assert res_auth.status_code == 200

def test_detect_image_valid_fixture(client):
    test_client, fixtures_dir = client
    img_path = os.path.join(fixtures_dir, "cam_01_single_pothole.jpg")
    headers = {"X-Internal-Token": settings.pothole_ai_internal_token}

    with open(img_path, "rb") as f:
        response = test_client.post(
            "/v1/detect/image",
            headers=headers,
            files={"image": ("cam_01.jpg", f, "image/jpeg")},
            data={
                "camera_id": "CAM-001",
                "request_id": "req-12345",
                "captured_at": "2026-09-12T10:00:00Z"
            }
        )

    assert response.status_code == 200
    data = response.json()

    assert data["contractVersion"] == "1.0"
    assert data["requestId"] == "req-12345"
    assert data["cameraId"] == "CAM-001"
    assert data["capturedAt"] == "2026-09-12T10:00:00Z"
    assert data["image"]["width"] == 1280
    assert data["image"]["height"] == 720

    # Frame Quality
    assert "frameQuality" in data
    assert data["frameQuality"]["usable"] is True
    assert "blurScore" in data["frameQuality"]
    assert "brightnessScore" in data["frameQuality"]

    # Detections
    assert len(data["detections"]) >= 1
    det = data["detections"][0]
    assert 0.0 <= det["bbox"]["x"] <= 1.0
    assert 0.0 <= det["bbox"]["y"] <= 1.0
    assert det["visualExtentCandidate"] in ("LOW", "MEDIUM", "HIGH")
    assert "model" in data
    assert data["model"]["runtimeMode"] == "DEMO"
    assert "processingMs" in data

def test_detect_image_invalid_mime_type(client):
    test_client, _ = client
    headers = {"X-Internal-Token": settings.pothole_ai_internal_token}

    response = test_client.post(
        "/v1/detect/image",
        headers=headers,
        files={"image": ("document.txt", b"plain text data", "text/plain")}
    )
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

def test_detect_image_invalid_confidence_bounds(client):
    test_client, fixtures_dir = client
    img_path = os.path.join(fixtures_dir, "cam_01_single_pothole.jpg")
    headers = {"X-Internal-Token": settings.pothole_ai_internal_token}

    with open(img_path, "rb") as f:
        response_high = test_client.post(
            "/v1/detect/image",
            headers=headers,
            files={"image": ("cam_01.jpg", f, "image/jpeg")},
            data={"confidence_threshold": 1.5}
        )
    assert response_high.status_code == 400
    assert "confidence_threshold" in response_high.json()["detail"]

    with open(img_path, "rb") as f:
        response_neg = test_client.post(
            "/v1/detect/image",
            headers=headers,
            files={"image": ("cam_01.jpg", f, "image/jpeg")},
            data={"confidence_threshold": -0.5}
        )
    assert response_neg.status_code == 400
    assert "confidence_threshold" in response_neg.json()["detail"]

def test_detect_image_valid_png(client):
    test_client, _ = client
    headers = {"X-Internal-Token": settings.pothole_ai_internal_token}

    # Generate small 100x100 PNG image in memory
    from PIL import Image
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color=(80, 80, 80))
    img.save(buf, format="PNG")
    buf.seek(0)

    response = test_client.post(
        "/v1/detect/image",
        headers=headers,
        files={"image": ("test.png", buf.getvalue(), "image/png")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["image"]["width"] == 100
    assert data["image"]["height"] == 100

def test_detect_image_max_upload_bytes_exceeded(client):
    test_client, _ = client
    headers = {"X-Internal-Token": settings.pothole_ai_internal_token}

    # Generate oversized payload exceeding MAX_UPLOAD_BYTES (10MB + 100 bytes)
    large_payload = b"0" * (10485760 + 100)

    response = test_client.post(
        "/v1/detect/image",
        headers=headers,
        files={"image": ("large.jpg", large_payload, "image/jpeg")}
    )
    assert response.status_code in (400, 413)
    assert "exceeds maximum limit" in response.json()["detail"]

def test_all_endpoints_require_internal_token(client):
    test_client, _ = client

    # 1. Image detect without token -> 401
    res1 = test_client.post(
        "/v1/detect/image",
        files={"image": ("test.jpg", b"fake", "image/jpeg")}
    )
    assert res1.status_code == 401

    # 2. Temporal confirm without token -> 401
    res2 = test_client.post("/v1/temporal/confirm", json=[])
    assert res2.status_code == 401

    # 3. Verification scan without token -> 401
    dummy_det = {
        "detectionId": "d1",
        "label": "pothole",
        "confidence": 0.9,
        "bbox": {"x": 0.1, "y": 0.1, "width": 0.1, "height": 0.1},
        "polygon": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]],
        "visibleAreaRatio": 0.01,
        "visualExtentCandidate": "MEDIUM"
    }
    res3 = test_client.post(
        "/v1/verification/evaluate",
        json={
            "baselineDetection": dummy_det,
            "currentCameraId": "CAM-01",
            "currentFrames": []
        }
    )
    assert res3.status_code == 401


