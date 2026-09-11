# Controlled Prototype Validation Benchmark

## Overview

This document presents the controlled validation benchmark metrics for the City Connect Pothole AI Service. 

> [!NOTE]
> **Label & Scope Disclaimer**:
> This benchmark evaluates prototype performance across controlled test fixtures (positive potholes, clear road surface, post-repair patches). It represents prototype verification metrics and does not make unverified claims regarding full-scale municipal camera deployment accuracy.

---

## Benchmark Results

- **Runtime Mode**: `REAL`
- **Model Name**: `YOLOv8-Seg-Pothole`
- **Model SHA-256**: `N/A (Demo)`
- **Total Test Samples**: `5`

### Confusion Matrix & Metrics

| Metric | Value |
|---|---|
| **True Positives (TP)** | `3` |
| **False Positives (FP)** | `0` |
| **False Negatives (FN)** | `1` |
| **True Negatives (TN)** | `2` |
| **Precision** | `100.0%` |
| **Recall** | `75.0%` |
| **F1 Score** | `0.8571` |
| **Average Processing Time** | `22.57 ms` |

---

## Detailed Sample Evaluations

| Sample ID | Image File | Type | Expected Potholes | Detected Potholes | Latency (ms) |
|---|---|---|---|---|---|
| `cam_01_single` | `cam_01_single_pothole.jpg` | `POSITIVE` | `1` | `1` | `33.01` |
| `cam_02_multi` | `cam_02_multi_pothole.jpg` | `POSITIVE` | `2` | `1` | `21.2` |
| `cam_03_clear` | `cam_03_clear_road.jpg` | `NEGATIVE` | `0` | `0` | `19.04` |
| `cam_04_before` | `cam_04_before_repair.jpg` | `POSITIVE` | `1` | `1` | `21.13` |
| `cam_04_after` | `cam_04_after_repair.jpg` | `HARD_NEGATIVE` | `0` | `0` | `18.47` |
