# City Connect - Pothole AI Detection Microservice

Request-triggered computer vision microservice for pothole instance segmentation, temporal repeated-detection tracking, and post-repair verification scan evaluation.

## Architectural Principles

1. **Explicit Request-Triggered Only**: The AI service operates statelessly. It NEVER continuously polls cameras or runs background daemons.
2. **Stateless AI Adapter**: City Connect owns users, DB persistence, S3 storage, tickets, and maps. The AI service receives image frames via HTTP and returns structured normalized coordinates.
3. **Normalized Coordinates**: Bounding boxes and segmentation polygons are returned normalized (`0.0` to `1.0`) relative to image dimensions.
4. **Model Provenance Integrity**: Requires verified YOLO weights (`yolov8n-seg-pothole.pt`, SHA-256: `04b05396b38dfe0801c3db2e4cc8c77e23b23c024a4cea37fce8295660817704`).
5. **No Biometric Surveillance**: Analyzes road surface quality only. No facial recognition or license plate tracking.

---

## Quick Start

### 1. Local Python Environment Setup

```bash
cd services/pothole-ai
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.lock.txt
```

### 2. Fetch Verified Model Weights

```bash
python scripts/fetch_model.py
```

### 3. Run Validation Benchmarks

```bash
# Real image model validation against licensed photographs
python scripts/run_real_validation.py

# Automated unit & integration tests
pytest -v
```

### 4. Start HTTP API Service

```bash
# DEMO mode (Synthetic mock)
POTHOLE_AI_MODE=demo uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# REAL mode (Ultralytics YOLO model)
POTHOLE_AI_MODE=real uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## Authentication & Secret Generation

Endpoints require `X-Internal-Token` header. To generate a secure 32-byte secret for production deployment:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Configure `POTHOLE_AI_INTERNAL_TOKEN` on both Express API (`apps/api`) and Pothole AI Service (`services/pothole-ai`).

---

## Prerecorded Video Scanner CLI

Process a prerecorded video file frame-by-frame:

```bash
python -m app.cli --video path/to/sample_road.mp4 --out-video output_annotated.mp4 --out-json scan_report.json --sample-interval 1.0
```

---

## Docker Container Deployment

```bash
docker build -t civicflow-pothole-ai .
docker run -p 8000:8000 -e POTHOLE_AI_MODE=demo -e POTHOLE_AI_INTERNAL_TOKEN=test-token civicflow-pothole-ai
```
