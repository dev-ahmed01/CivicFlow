import os
import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from fixtures.generate_fixtures import generate_all_fixtures

@pytest.fixture(scope="module")
def client(tmp_path_factory):
    fixtures_dir = tmp_path_factory.mktemp("fixtures")
    generate_all_fixtures(str(fixtures_dir))
    with TestClient(app) as test_client:
        yield test_client, fixtures_dir

def test_health_check(client):
    test_client, _ = client
    response = test_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["modelLoaded"] is True
    assert "version" in data
    assert "modelName" in data

def test_detect_image_valid_fixture(client):
    test_client, fixtures_dir = client
    img_path = os.path.join(fixtures_dir, "cam_01_single_pothole.jpg")
    with open(img_path, "rb") as f:
        response = test_client.post(
            "/v1/detect/image",
            files={"image": ("cam_01.jpg", f, "image/jpeg")},
            data={
                "camera_id": "CAM-001",
                "request_id": "req-12345",
                "captured_at": "2026-09-12T10:00:00Z"
            }
        )

    assert response.status_code == 200
    data = response.json()

    assert data["requestId"] == "req-12345"
    assert data["cameraId"] == "CAM-001"
    assert data["capturedAt"] == "2026-09-12T10:00:00Z"
    assert data["image"]["width"] == 1280
    assert data["image"]["height"] == 720
    assert isinstance(data["detections"], list)
    assert len(data["detections"]) >= 1

    # Check normalized coordinate contract
    det = data["detections"][0]
    assert 0.0 <= det["bbox"]["x"] <= 1.0
    assert 0.0 <= det["bbox"]["y"] <= 1.0
    assert 0.0 <= det["bbox"]["width"] <= 1.0
    assert 0.0 <= det["bbox"]["height"] <= 1.0
    assert isinstance(det["polygon"], list)
    assert len(det["polygon"]) >= 3
    assert "processingMs" in data

def test_detect_image_clear_road(client):
    test_client, fixtures_dir = client
    img_path = os.path.join(fixtures_dir, "cam_03_clear_road.jpg")
    with open(img_path, "rb") as f:
        response = test_client.post(
            "/v1/detect/image",
            files={"image": ("cam_03.jpg", f, "image/jpeg")}
        )

    assert response.status_code == 200
    data = response.json()
    assert len(data["detections"]) == 0

def test_detect_image_bad_payload(client):
    test_client, _ = client
    response = test_client.post(
        "/v1/detect/image",
        files={"image": ("corrupt.txt", b"invalid-bytes", "text/plain")}
    )
    assert response.status_code == 400
    data = response.json()
    assert "detail" in data
