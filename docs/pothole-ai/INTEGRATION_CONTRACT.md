# Pothole AI Service - Integration & Handoff Contract

> [!IMPORTANT]
> **Surveillance & Architecture Guarantee**:
> The Pothole AI Service never independently polls cameras, records video streams, or runs background surveillance watchers. Camera access is strictly **request-triggered**. The service processes an image frame ONLY when City Connect explicitly sends an API request (`POST /v1/detect/image`).

---

## 1. Core Service Architecture

- **Protocol**: HTTP / REST JSON
- **Default Port**: `8000`
- **Base URL**: `http://localhost:8000` (or `http://pothole-ai:8000` in container environment)
- **Role Separation**:
  - **City Connect Node.js/Express App**: Owns authentication, camera metadata, ward mappings, ticket creation, S3 image persistence, map rendering, and Project Head approval workflows.
  - **Pothole AI Microservice**: Stateless computer vision engine. Receives image binary payloads, performs YOLOv8 instance segmentation, and returns normalized coordinates and model metadata.

---

## 2. API Endpoints

### 2.1 GET `/health`

Verifies service readiness and model loading status.

**Response `200 OK`**:
```json
{
  "status": "ok",
  "modelLoaded": true,
  "modelName": "YOLOv8-Seg-Pothole",
  "version": "1.0.0",
  "device": "cpu"
}
```

---

### 2.2 POST `/v1/detect/image`

Primary endpoint for Area Scan and Verification Scan image frame analysis.

**Content-Type**: `multipart/form-data`

**Form Parameters**:
- `image` *(File, Required)*: JPEG or PNG binary image payload.
- `camera_id` *(String, Optional)*: Identifier of the authorized road-facing camera source (e.g. `CAM-MG-ROAD-01`).
- `captured_at` *(String, Optional)*: ISO 8601 timestamp when frame was captured.
- `request_id` *(String, Optional)*: City Connect scan request tracking ID.
- `confidence_threshold` *(Float, Optional)*: Confidence cutoff (default `0.25`).

**Response `200 OK`**:
```json
{
  "requestId": "req-88491",
  "cameraId": "CAM-MG-ROAD-01",
  "capturedAt": "2026-09-12T10:15:30Z",
  "image": {
    "width": 1920,
    "height": 1080
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
      "visibleAreaRatio": 0.0081,
      "visualSeverityCandidate": "MEDIUM"
    }
  ],
  "model": {
    "name": "YOLOv8-Seg-Pothole",
    "version": "1.0.0",
    "threshold": 0.25
  },
  "processingMs": 112
}
```

---

## 3. Coordinate Conventions & Severity Rules

### Normalized Coordinates (0.0 to 1.0)
- All `bbox` (`x`, `y`, `width`, `height`) and `polygon` contour points `[x, y]` are normalized from `0.0` to `1.0` relative to original image dimensions:
  $$\text{x\_norm} = \frac{\text{pixel\_x}}{\text{image\_width}}, \quad \text{y\_norm} = \frac{\text{pixel\_y}}{\text{image\_height}}$$
- City Connect frontends (MapLibre / Canvas / SVG) overlay bounding boxes and masks on scaled images by multiplying normalized coordinates by rendered canvas width and height.

### Area & Severity Heuristic
- `visibleAreaRatio`: Mask area divided by total image area ($0.0 \dots 1.0$).
- `visualSeverityCandidate`: Visual demo classification based on image area ratio:
  - `< 0.005` ( $< 0.5\%$ of image area): `LOW`
  - `0.005 - 0.02` ($0.5\% - 2.0\%$): `MEDIUM`
  - `> 0.02` ( $> 2.0\%$): `HIGH`
- *Note*: Visibly labeled as an uncalibrated visual heuristic. Physical depth or exact metric dimensions require field engineering measurement.

---

## 4. Temporal Confirmation Engine

For static road cameras, City Connect can pass a sequence of frame detections to `POST /v1/temporal/confirm` to confirm repeated physical observations over time:

**Request Payload**:
```json
[
  {
    "frameIndex": 0,
    "timestampSec": 0.0,
    "detections": [...]
  },
  {
    "frameIndex": 30,
    "timestampSec": 1.0,
    "detections": [...]
  }
]
```

**Response Payload**:
```json
{
  "totalFramesProcessed": 10,
  "totalRawDetections": 12,
  "confirmedClusters": [
    {
      "clusterId": "cluster-a1b2c3d4",
      "repeatCount": 8,
      "firstTimestampSec": 0.0,
      "lastTimestampSec": 9.0,
      "averageConfidence": 0.92,
      "canonicalBbox": { "x": 0.20, "y": 0.56, "width": 0.13, "height": 0.09 },
      "canonicalPolygon": [[0.20, 0.58], [0.23, 0.55], [0.29, 0.56]],
      "maxVisibleAreaRatio": 0.0085,
      "visualSeverityCandidate": "MEDIUM"
    }
  ]
}
```

---

## 5. Verification Scan Semantics

When evaluating post-repair scans (`POST /v1/verification/evaluate`), the service compares pre-repair baseline ROI against new scan detections:

**Possible Status Values**:
1. `DEFECT_STILL_DETECTED`: A pothole detection overlaps the baseline ROI above IoU threshold ($\ge 0.30$). Defect remains unpatched or partially unpatched.
2. `NO_MATCHING_DEFECT_DETECTED`: Clear post-repair scan with zero overlapping detections in baseline ROI. Road surface patched.
3. `INCONCLUSIVE`: Scans marked with poor lighting, angle mismatch, or camera obstruction (`qualityOK: false`).

---

## 6. Error Responses

All errors return clean structured JSON without exposing Python stack traces:

**Bad Request `400`**:
```json
{
  "detail": "Failed to decode image. File may be corrupt or an unsupported format."
}
```

**Service Unavailable `503`**:
```json
{
  "detail": "Pothole AI model is not ready or failed to load."
}
```

---

## 7. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8000` | HTTP service port |
| `MODEL_PATH` | `weights/yolov8n-seg-pothole.pt` | Path to YOLOv8-seg weights or `MOCK` |
| `CONFIDENCE_THRESHOLD` | `0.25` | Default confidence cutoff |
| `DEVICE` | `cpu` | PyTorch device (`cpu`, `cuda`, `auto`) |
| `TEMPORAL_IOU_THRESHOLD` | `0.30` | IoU threshold for temporal clustering |
| `TEMPORAL_MIN_REPEAT_FRAMES` | `3` | Min frame observations for confirmation |
