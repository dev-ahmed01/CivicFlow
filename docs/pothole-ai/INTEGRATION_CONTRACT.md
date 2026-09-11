# Pothole AI Service - Integration & Handoff Contract (v1.0)

> [!IMPORTANT]
> **Surveillance & Architecture Guarantee**:
> The Pothole AI Service never independently polls cameras, records video streams, or runs background surveillance watchers. Camera access is strictly **request-triggered**. The service processes an image frame ONLY when City Connect explicitly sends an API request (`POST /v1/detect/image`).

---

## 1. Core Service Architecture & Authentication

- **Protocol**: HTTP / REST JSON
- **Default Port**: `8000` (Configurable via `PORT` env var)
- **Base URL**: `http://localhost:8000` (or `http://pothole-ai:8000` in container environment)
- **Contract Version**: `"1.0"`
- **Server-to-Server Authentication**:
  - Requires `X-Internal-Token` header on all `/v1/*` inference endpoints.
  - Token value is configured via `POTHOLE_AI_INTERNAL_TOKEN` (default: `dev-secret-token-civicflow`).
  - `/health` endpoint remains unauthenticated for container readiness probes.

---

## 2. API Endpoints

### 2.1 GET `/health`

Verifies service readiness and exposes runtime mode (`REAL` vs `DEMO`).

**Response `200 OK` (Ready in DEMO or REAL mode)**:
```json
{
  "contractVersion": "1.0",
  "status": "ok",
  "runtimeMode": "DEMO",
  "modelLoaded": true,
  "modelName": "Synthetic-Pothole-Demo",
  "weightsSha256": null,
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

### 2.2 POST `/v1/detect/image`

Primary endpoint for Area Scan and Verification Scan image frame analysis.

**Headers**:
- `X-Internal-Token`: `dev-secret-token-civicflow` (Required)

**Content-Type**: `multipart/form-data`

**Form Parameters**:
- `image` *(File, Required)*: JPEG or PNG binary image payload (Max `10MB`).
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
    "name": "YOLOv8-Seg-Pothole",
    "version": "1.0.0",
    "runtimeMode": "REAL",
    "weightsSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "source": "FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment",
    "threshold": 0.25
  },
  "processingMs": 112
}
```

---

## 3. Coordinate Conventions & Extent Rules

### Normalized Coordinates (0.0 to 1.0)
- All `bbox` (`x`, `y`, `width`, `height`) and `polygon` contour points `[x, y]` are normalized from `0.0` to `1.0` relative to original image dimensions:
  $$x_{\text{norm}} = \frac{\text{pixel\_x}}{\text{image\_width}}, \quad y_{\text{norm}} = \frac{\text{pixel\_y}}{\text{image\_height}}$$
- If an oversized image is downscaled internally before inference, coordinates are scaled back to match original image dimensions.

### Area & Extent Cutoffs
- `visualExtentCandidate`: Relative image extent cutoff:
  - `< 0.005` ( $< 0.5\%$ of image area): `LOW`
  - `0.005 - 0.02` ($0.5\% - 2.0\%$): `MEDIUM`
  - `> 0.02` ( $> 2.0\%$): `HIGH`
- *Note*: Represents relative visible image extent, NOT physical depth or engineering severity.

---

## 4. Temporal Confirmation Engine

For static road cameras, City Connect passes a sequence of frame detections to `POST /v1/temporal/confirm`:

**Rules**:
- All frames MUST belong to ONE camera ID.
- `uniqueFrameCount` counts DISTINCT frames in which the physical defect was observed. Multiple detections in the SAME frame do not double-count.

**Response Payload**:
```json
{
  "totalFramesProcessed": 10,
  "totalRawDetections": 12,
  "confirmedClusters": [
    {
      "clusterId": "cluster-a1b2c3d4",
      "uniqueFrameCount": 8,
      "repeatCount": 8,
      "firstTimestampSec": 0.0,
      "lastTimestampSec": 9.0,
      "averageConfidence": 0.92,
      "canonicalBbox": { "x": 0.20, "y": 0.56, "width": 0.13, "height": 0.09 },
      "canonicalPolygon": [[0.20, 0.58], [0.23, 0.55], [0.29, 0.56]],
      "maxVisibleAreaRatio": 0.0085,
      "visualExtentCandidate": "MEDIUM"
    }
  ]
}
```

---

## 5. Verification Scan Semantics

`POST /v1/verification/evaluate` compares pre-repair baseline ROI against post-repair scan frames:

**Possible Status Values**:
1. `DEFECT_STILL_DETECTED`: Matching pothole detection overlaps baseline ROI across usable verification frames. Defect persists.
2. `NO_MATCHING_DEFECT_DETECTED`: Minimum usable verification frames pass quality checks with ZERO matching detections in baseline ROI. Surface patched.
3. `INCONCLUSIVE`: Scans have poor frame quality (too blurry/dark/obstructed), camera ID mismatch, or insufficient usable frames ($\le 2$).

---

## 6. Error Responses

- `401 Unauthorized`: Missing or invalid `X-Internal-Token` header.
- `400 Bad Request`: Non-JPEG/PNG file, invalid payload, or mixed camera IDs.
- `413 Payload Too Large`: Upload file exceeds `MAX_UPLOAD_BYTES` ($10\text{ MB}$).
- `503 Service Unavailable`: AI model uninitialized or REAL mode model load failure.

---

## 7. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | HTTP service port |
| `POTHOLE_AI_MODE` | `real` | Runtime mode: `real` (requires weights) or `demo` (mock) |
| `POTHOLE_AI_INTERNAL_TOKEN` | `dev-secret-token-civicflow` | Server-to-server auth token |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5000` | Allowed CORS origins |
| `MODEL_PATH` | `weights/yolov8n-seg-pothole.pt` | Path to YOLOv8-seg weights file |
| `CONFIDENCE_THRESHOLD` | `0.25` | Default confidence threshold |
| `MAX_UPLOAD_BYTES` | `10485760` | Upload file size limit ($10\text{ MB}$) |
| `MAX_IMAGE_DIMENSION` | `1920` | Max dimension before safe downscaling |
