# Pothole AI Service - Integration & Handoff Contract (v1.0)

> [!IMPORTANT]
> **Surveillance & Architecture Guarantee**:
> The Pothole AI Service never independently polls cameras, records video streams, or runs background surveillance watchers. Camera access is strictly **request-triggered**. The service processes an image frame ONLY when City Connect explicitly sends an API request (`POST /v1/detect/image`).

---

## 1. Deployment & Railway Architecture

The Pothole AI Service runs as an **isolated, standalone microservice** alongside the main City Connect Express API.

```
┌─────────────────┐       HTTPS       ┌────────────────────────┐
│  Citizen Web /  │ ────────────────> │  City Connect Express  │
│ Project Head UI │                   │    API (apps/api)      │
└─────────────────┘                   └────────────────────────┘
                                                  │
                                                  │ Private HTTP / Server-to-Server
                                                  │ Header: X-Internal-Token
                                                  ▼
                                      ┌────────────────────────┐
                                      │   Pothole AI Service   │
                                      │ (services/pothole-ai)  │
                                      └────────────────────────┘
```

### Railway Environment Configurations

#### 1. City Connect Express API Service (`apps/api`)
```env
POTHOLE_AI_URL=http://pothole-ai.railway.internal:8000
POTHOLE_AI_INTERNAL_TOKEN=<SHARED_STRONG_RANDOM_SECRET>
```

#### 2. Pothole AI Service (`services/pothole-ai`)
```env
PORT=8000
POTHOLE_AI_MODE=real
POTHOLE_AI_INTERNAL_TOKEN=<SHARED_STRONG_RANDOM_SECRET>
MODEL_PATH=weights/yolov8n-seg-pothole.pt
```

### Generating Production Secrets
Do **NOT** commit production secrets to Git. To generate a secure random 32-byte secret for `POTHOLE_AI_INTERNAL_TOKEN`, execute:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```
Configure the **exact same token** on both Express API and Pothole AI Railway services.

---

## 2. Core Service Architecture & Authentication

- **Protocol**: HTTP / REST JSON
- **Default Port**: Configured dynamically via `PORT` env var (Railway default)
- **Contract Version**: `"1.0"`
- **Server-to-Server Authentication**:
  - Requires `X-Internal-Token` header on all `/v1/*` inference endpoints.
  - Authentication checked via constant-time comparison `secrets.compare_digest`.
  - `/health` endpoint remains unauthenticated for readiness probes.

---

## 3. API Endpoints

### 3.1 GET `/health`

Verifies service readiness and exposes runtime mode (`REAL` vs `DEMO`).

**Response `200 OK` (Ready in REAL mode)**:
```json
{
  "contractVersion": "1.0",
  "status": "ok",
  "runtimeMode": "REAL",
  "modelLoaded": true,
  "modelName": "yolov8n-seg-pothole.pt",
  "weightsSha256": "04b05396b38dfe0801c3db2e4cc8c77e23b23c024a4cea37fce8295660817704",
  "version": "1.0.0",
  "device": "cpu"
}
```

**Response `503 Service Unavailable` (Unhealthy REAL mode)**:
```json
{
  "contractVersion": "1.0",
  "status": "unhealthy",
  "runtimeMode": "REAL",
  "modelLoaded": false,
  "modelName": "Uninitialized",
  "weightsSha256": null,
  "version": "1.0.0",
  "device": "cpu"
}
```

---

### 3.2 POST `/v1/detect/image`

Primary endpoint for Area Scan and Verification Scan image frame analysis.

**Headers**:
- `X-Internal-Token`: `<SHARED_STRONG_RANDOM_SECRET>` (Required)

**Content-Type**: `multipart/form-data`

**Form Parameters**:
- `image` *(File, Required)*: JPEG, PNG, or WebP binary image payload (Max `10MB`).
- `camera_id` *(String, Optional)*: Identifier of the authorized camera source (Max 100 chars).
- `captured_at` *(String, Optional)*: ISO 8601 capture timestamp.
- `request_id` *(String, Optional)*: City Connect scan tracking ID.
- `confidence_threshold` *(Float, Optional)*: Confidence cutoff ($0.0 \dots 1.0$, default `0.25`).

**Response `200 OK`**:
```json
{
  "contractVersion": "1.0",
  "requestId": "req-88491",
  "cameraId": "CAM-MG-ROAD-01",
  "capturedAt": "2026-09-12T10:15:30Z",
  "image": {
    "width": 1920,
    "height": 1080
  },
  "frameQuality": {
    "usable": true,
    "blurScore": 143.20,
    "brightnessScore": 0.6100,
    "reasons": []
  },
  "detections": [
    {
      "detectionId": "9b1deb4d-3b7d-41b5-963d-780c2f2167d4",
      "label": "pothole",
      "confidence": 0.94,
      "bbox": {
        "x": 0.20,
        "y": 0.56,
        "width": 0.13,
        "height": 0.09
      },
      "polygon": [
        [0.20, 0.58],
        [0.23, 0.55],
        [0.29, 0.56],
        [0.28, 0.62]
      ],
      "visibleAreaRatio": 0.008100,
      "visualExtentCandidate": "MEDIUM",
      "visualSeverityCandidate": "MEDIUM"
    }
  ],
  "model": {
    "name": "yolov8n-seg-pothole.pt",
    "version": "1.0.0",
    "runtimeMode": "REAL",
    "weightsSha256": "04b05396b38dfe0801c3db2e4cc8c77e23b23c024a4cea37fce8295660817704",
    "source": "FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment",
    "threshold": 0.25
  },
  "processingMs": 112
}
```

---

## 4. Coordinate Conventions & Extent Rules

### Normalized Coordinates (0.0 to 1.0)
- All `bbox` (`x`, `y`, `width`, `height`) and `polygon` contour points `[x, y]` are normalized from `0.0` to `1.0` relative to original image dimensions:
  $$x_{\text{norm}} = \frac{\text{pixel\_x}}{\text{image\_width}}, \quad y_{\text{norm}} = \frac{\text{pixel\_y}}{\text{image\_height}}$$

### Area & Extent Cutoffs
- `visualExtentCandidate`: Relative image extent cutoff:
  - `< 0.005` ( $< 0.5\%$ of image area): `LOW`
  - `0.005 - 0.02` ($0.5\% - 2.0\%$): `MEDIUM`
  - `> 0.02` ( $> 2.0\%$): `HIGH`
- *Note*: Represents relative visible image extent, NOT physical depth or engineering severity.

---

## 5. Temporal Confirmation Engine

`POST /v1/temporal/confirm` analyzes sequential frame detections from a single static camera:
- All frames MUST belong to ONE camera ID.
- `uniqueFrameCount` counts DISTINCT frames in which the physical defect was observed. Multiple detections in the SAME frame do not double-count.

---

## 6. Verification Scan Semantics

`POST /v1/verification/evaluate` compares pre-repair baseline ROI against post-repair scan frames:
- `DEFECT_STILL_DETECTED`: Matching pothole detection overlaps baseline ROI across usable verification frames.
- `NO_MATCHING_DEFECT_DETECTED`: Minimum usable verification frames ($\ge 3$) pass quality checks with ZERO matching detections in baseline ROI.
- `INCONCLUSIVE`: Scans have poor frame quality, camera ID mismatch, or insufficient usable frames ($\le 2$).

---

## 7. Error Responses

- `401 Unauthorized`: Missing or invalid `X-Internal-Token` header.
- `400 Bad Request`: Non-JPEG/PNG file, invalid payload, or mixed camera IDs.
- `413 Payload Too Large`: Upload file exceeds `MAX_UPLOAD_BYTES` ($10\text{ MB}$).
- `503 Service Unavailable`: AI model uninitialized or REAL mode model load failure.

---

## 8. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | HTTP service port (Set dynamically by Railway) |
| `POTHOLE_AI_MODE` | `real` | Runtime mode: `real` (requires weights) or `demo` (mock) |
| `POTHOLE_AI_INTERNAL_TOKEN` | `change-me` | Server-to-server auth token |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5000` | Allowed CORS origins |
| `MODEL_PATH` | `weights/yolov8n-seg-pothole.pt` | Path to YOLOv8-seg weights file |
| `CONFIDENCE_THRESHOLD` | `0.25` | Default confidence threshold |
| `MAX_UPLOAD_BYTES` | `10485760` | Upload file size limit ($10\text{ MB}$) |
| `MAX_IMAGE_DIMENSION` | `1920` | Max dimension before safe downscaling |
