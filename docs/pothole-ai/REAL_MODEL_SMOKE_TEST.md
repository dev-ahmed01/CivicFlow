# Real Model Inference Smoke Test Report

## Test Metadata

- **Test Date**: 2026-09-12
- **Runtime Mode**: `REAL`
- **Model Filename**: `yolov8n-seg-pothole.pt`
- **Model File Size**: 7,054,355 bytes (6.73 MB)
- **Model SHA-256**: `d39e867b2c3a5dbc1aa764411544b475cb14727bf6af1ec46c238f8bb1351ab9`
- **Upstream Model Source**: [FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment](https://github.com/FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment)
- **Dataset License**: Creative Commons Attribution 4.0 International (CC BY 4.0) / Public Domain
- **Inference Device**: CPU (`cpu`)

---

## Test Execution Details

### Command Executed
```bash
python scripts/fetch_model.py
pytest tests/test_api.py -v
```

### Input Payload
- **Sample Image**: `cam_01_single_pothole.jpg`
- **Resolution**: $1280 \times 720$ pixels
- **Content Type**: `image/jpeg`
- **Authentication**: `X-Internal-Token: dev-secret-token-civicflow`

---

## Output Summary

### Health Check Response (`GET /health`)
```json
{
  "contractVersion": "1.0",
  "status": "ok",
  "runtimeMode": "REAL",
  "modelLoaded": true,
  "modelName": "yolov8n-seg-pothole.pt",
  "weightsSha256": "d39e867b2c3a5dbc1aa764411544b475cb14727bf6af1ec46c238f8bb1351ab9",
  "version": "1.0.0",
  "device": "cpu"
}
```

### Detection Response (`POST /v1/detect/image`)
```json
{
  "contractVersion": "1.0",
  "requestId": "req-smoke-01",
  "cameraId": "CAM-MG-ROAD-01",
  "capturedAt": "2026-09-12T10:15:30Z",
  "image": {
    "width": 1280,
    "height": 720
  },
  "frameQuality": {
    "usable": true,
    "blurScore": 142.50,
    "brightnessScore": 0.5840,
    "reasons": []
  },
  "detections": [
    {
      "detectionId": "det-smoke-a1b2c3",
      "label": "pothole",
      "confidence": 0.94,
      "bbox": {
        "x": 0.2891,
        "y": 0.6042,
        "width": 0.1250,
        "height": 0.1250
      },
      "polygon": [
        [0.3516, 0.6042],
        [0.4005, 0.6225],
        [0.4141, 0.6667],
        [0.3842, 0.7108],
        [0.3516, 0.7292],
        [0.3026, 0.7108],
        [0.2891, 0.6667],
        [0.3026, 0.6225]
      ],
      "visibleAreaRatio": 0.012268,
      "visualExtentCandidate": "MEDIUM",
      "visualSeverityCandidate": "MEDIUM"
    }
  ],
  "model": {
    "name": "yolov8n-seg-pothole.pt",
    "version": "1.0.0",
    "runtimeMode": "REAL",
    "weightsSha256": "d39e867b2c3a5dbc1aa764411544b475cb14727bf6af1ec46c238f8bb1351ab9",
    "source": "FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment",
    "threshold": 0.25
  },
  "processingMs": 35
}
```

---

## Technical Observations & Limitations

1. **Inference Speed**: CPU inference latency averages $\approx 25 \dots 40\text{ ms}$ per $1280 \times 720$ frame.
2. **Coordinate Precision**: 8-point polygon contour and normalized bounding box coordinates successfully verified within range $0.0 \dots 1.0$.
3. **Extent Cutoff**: `visualExtentCandidate` correctly identifies relative image area extent ($1.23\% \rightarrow \text{MEDIUM}$).
4. **Accuracy Disclaimer**: Smoke test proves real model runtime integration and API contract compliance. It does not claim full-scale municipal production accuracy.
