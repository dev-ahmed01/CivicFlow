# Controlled Prototype Validation & Benchmark Report

## Overview

This document presents the validation methodology and benchmark metrics for the City Connect Pothole AI Service. Validation is separated into two distinct categories:

1. **Synthetic Pipeline Validation**: Proves software pipeline determinism, normalization, quality scoring, temporal clustering, and post-repair verification logic.
2. **Real Image Model Validation**: Prototype evaluation of the fine-tuned YOLOv8-seg model on real, licensed road photographs.

---

## A. Synthetic Pipeline Validation

**Purpose**: Verifies system stability, API contract compliance, and edge-case handling using generated test fixtures.

| Fixture | Scenario | Expected Behavior | Result |
|---|---|---|---|
| `cam_01_single` | Single Pothole | 1 detection, normalized coords 0..1, `visualExtentCandidate` computed | **PASS** |
| `cam_02_multi` | Multiple Potholes | 2 detections, distinct bounding boxes & polygons | **PASS** |
| `cam_03_clear` | Clear Road Surface | 0 detections, frame marked usable | **PASS** |
| `cam_04_before` | Pre-Repair Defect | 1 baseline detection saved for verification | **PASS** |
| `cam_04_after` | Post-Repair Patch | 0 matching detections $\rightarrow$ `NO_MATCHING_DEFECT_DETECTED` | **PASS** |

---

## B. Real Image Model Validation

**Purpose**: Prototype evaluation of trained YOLOv8-seg weights (`yolov8n-seg-pothole.pt`) on real road photographs.

### Model Provenance
- **Model Name**: `yolov8n-seg-pothole.pt`
- **Upstream Source**: `FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment` (`model/best.pt`)
- **Verified SHA-256**: `04b05396b38dfe0801c3db2e4cc8c77e23b23c024a4cea37fce8295660817704`
- **Verified Size**: `6,792,824 bytes` (~6.79 MB)
- **Runtime Mode**: `REAL`

### Evaluation Methodology
- **Scope**: Image-Level Binary Classification (Pothole Detected vs Clear Road Surface)
- **Dataset**: 8 real photographs from Wikimedia Commons (5 Positive, 3 Negative/Hard-Negative)

### Confusion Matrix & Metrics

| Metric | Count / Value | Calculation / Formula |
|---|---|---|
| **True Positives (TP)** | `5` | Correctly identified pothole photographs (`real_sample_01` .. `05`) |
| **False Positives (FP)** | `0` | Clear/cracked road images incorrectly labeled as pothole |
| **False Negatives (FN)** | `0` | Pothole photographs missed by detector |
| **True Negatives (TN)** | `3` | Clear/cracked asphalt road surfaces (`real_sample_06` .. `08`) |
| **Total Evaluated** | `8` | $\text{TP} + \text{FP} + \text{FN} + \text{TN} = 5 + 0 + 0 + 3 = 8$ |
| **Precision** | `100.0%` | $\frac{TP}{TP + FP} = \frac{5}{5 + 0}$ |
| **Recall** | `100.0%` | $\frac{TP}{TP + FN} = \frac{5}{5 + 0}$ |
| **F1 Score** | `1.0000` | Harmonic mean |
| **Avg Processing Time** | `1321 ms` | Includes high-resolution $4000\times 3000$+ downscaling |

---

## Detailed Real Sample Inventory

| Sample ID | Title / Source | License | Expected | Detections | Max Conf | Outcome |
|---|---|---|---|---|---|---|
| `real_sample_01` | A photo of a pothole | CC BY-SA 4.0 | `pothole` | 2 | `0.9348` | **TP** |
| `real_sample_02` | Pothole in Dilova Street Kyiv | CC0 | `pothole` | 1 | `0.9343` | **TP** |
| `real_sample_03` | Pothole Big | Public domain | `pothole` | 1 | `0.9393` | **TP** |
| `real_sample_04` | Pothole in Potomac after rain (Puddle) | CC BY-SA 4.0 | `pothole` | 1 | `0.8717` | **TP** |
| `real_sample_05` | Pothole in asphalt pavement | CC BY-SA 4.0 | `pothole` | 1 | `0.6212` | **TP** |
| `real_sample_06` | Asphalt road surface clear | CC0 | `clear` | 0 | - | **TN** |
| `real_sample_07` | Damaged asphalt surface cracked | CC0 | `clear` | 0 | - | **TN** |
| `real_sample_08` | Damaged road surface Spain | CC BY 3.0 | `clear` | 0 | - | **TN** |

> [!NOTE]
> **Controlled Prototype Validation Disclaimer**:
> Sample size is small (8 samples) and is not representative of municipal-scale camera performance under all lighting, night, heavy rain, or severe traffic occlusion conditions.
