# City Connect - Pothole AI Detection Microservice

Request-triggered computer vision microservice for pothole instance segmentation, temporal repeated-detection tracking, and post-repair verification scan evaluation.

## Architectural Principles

1. **Explicit Request-Triggered Only**: The AI service operates statelessly. It NEVER continuously polls cameras or runs background daemons.
2. **Stateless AI Adapter**: City Connect owns users, DB persistence, S3 storage, tickets, and maps. The AI service receives image frames via HTTP and returns structured normalized coordinates.
3. **Normalized Coordinates**: Bounding boxes and segmentation polygons are returned normalized (`0.0` to `1.0`) relative to image dimensions.
4. **No Biometric Surveillance**: Analyzes road surface quality only. No facial recognition or license plate tracking.

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

pip install -r requirements.txt
```

### 2. Generate Demo Fixtures

```bash
python fixtures/generate_fixtures.py
```

### 3. Run Automated Tests

```bash
pytest -v
```

### 4. Start HTTP API Service

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive API documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

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
docker run -p 8000:8000 civicflow-pothole-ai
```
