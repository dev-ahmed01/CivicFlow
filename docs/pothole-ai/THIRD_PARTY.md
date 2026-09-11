# Third-Party Model & License Evaluation

## Overview

The Pothole AI Service integrated into CivicFlow (City Connect) uses state-of-the-art computer vision models for road damage assessment and pothole segmentation. This document details the open-source sources, model architecture, dataset licensing, and legal/license implications for development and future commercial deployment.

---

## Evaluated Repositories & Models

### 1. Primary Candidate: `YOLOv8_Pothole_Segmentation_Road_Damage_Assessment`
- **Repository**: [FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment](https://github.com/FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment)
- **Repository License**: MIT License
- **Model Architecture**: YOLOv8 Nano/Small Instance Segmentation (`yolov8n-seg` / `yolov8s-seg`)
- **Primary Functionality**: Predicts 2D bounding boxes and pixel-level instance segmentation masks for potholes on road surfaces.

### 2. Dataset Sources
- **Roboflow Universe Pothole Segmentation Datasets**: Publicly available datasets licensed under Creative Commons Attribution 4.0 International (CC BY 4.0) or Public Domain.
- **Kaggle Pothole Detection & Segmentation Datasets**: Open-access annotated datasets for civic road condition research.

---

## Dependency Licensing & Implications

### Ultralytics Framework Licensing (AGPL-3.0)
- **Framework**: `ultralytics` Python package.
- **License**: GNU Affero General Public License v3.0 (AGPL-3.0).
- **Implications for CivicFlow**:
  - **Open-Source / Student / SIH Hackathon Use**: Compliant under AGPL-3.0. CivicFlow is an open-source civic codebase.
  - **Microservice Isolation**: Because the Pothole AI service is designed as an isolated HTTP REST microservice operating over network APIs (`POST /v1/detect/image`), its runtime dependency on `ultralytics` does not contaminate the host City Connect Node.js/TypeScript application codebase.
  - **Proprietary Commercial Deployment**: If a commercial entity deploys this service in a closed-source proprietary offering without releasing source code, they must either:
    1. Obtain an Enterprise Commercial License from Ultralytics Inc.
    2. Export model weights to an open format (e.g. **ONNX**) and execute inference using open-source engines like `onnxruntime` (MIT License) or OpenCV DNN (Apache 2.0).

---

## Attribution Requirements

1. **FarzadNekouee / Pothole Segmentation**:
   - Original work by Farzad Nekouee under MIT License.
   - Copyright (c) Farzad Nekouee.
2. **Ultralytics YOLOv8**:
   - Developed by Ultralytics Inc. under AGPL-3.0.
3. **OpenCV / PyTorch**:
   - OpenCV: Apache License 2.0.
   - PyTorch: BSD-style License.

---

## Commercial / Legal Review Checklist Before Proprietary Deployment

- [ ] Confirm open-source repository licenses match expected MIT/Apache-2.0 terms.
- [ ] Evaluate ONNX runtime export to eliminate `ultralytics` AGPL dependency if closed-source distribution is intended.
- [ ] Audit training dataset licenses (ensure CC BY or Public Domain compliance).
- [ ] Ensure non-surveillance boundary compliance (no facial or license-plate retention).

*Note: This document provides engineering analysis of open-source software licenses and does not constitute formal legal advice.*
