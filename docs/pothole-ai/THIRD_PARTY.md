# Third-Party Model & License Evaluation

## Overview

The Pothole AI Service integrated into CivicFlow (City Connect) uses computer vision models for road damage assessment and pothole instance segmentation. This document provides an engineering evaluation of open-source model repositories, dataset licenses, dependency licensing, and commercial deployment considerations.

---

## Evaluated Repositories & Models

### 1. Upstream Candidate: `YOLOv8_Pothole_Segmentation_Road_Damage_Assessment`
- **Repository**: [FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment](https://github.com/FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment)
- **Repository License**: MIT License
- **Model Architecture**: YOLOv8 Nano/Small Instance Segmentation (`yolov8n-seg`)
- **Primary Functionality**: Predicts 2D bounding boxes and pixel-level instance segmentation masks for potholes on road surfaces.

### 2. Dataset Sources
- **Roboflow Universe Pothole Datasets**: Publicly available datasets licensed under Creative Commons Attribution 4.0 International (CC BY 4.0) or Public Domain.
- **Kaggle Pothole Datasets**: Open-access annotated datasets for civic road condition research.

---

## Dependency Licensing & Architectural Considerations

### Ultralytics Framework Licensing (AGPL-3.0)
- **Framework**: `ultralytics` Python package.
- **License**: GNU Affero General Public License v3.0 (AGPL-3.0).
- **Engineering Framing & Compliance Notes**:
  - **Open-Source / Student / SIH Hackathon Scope**: Compliant under AGPL-3.0. CivicFlow is an open-source civic codebase.
  - **Microservice Architectural Boundary**: The Pothole AI service is isolated as a separate HTTP microservice communicating over network REST APIs (`POST /v1/detect/image`). While network boundary isolation is an established software architecture pattern, legal interpretations of AGPL network interaction in commercial closed-source software may vary.
  - **Proprietary Commercial Path**: If a commercial entity deploys this service in a closed-source proprietary offering without releasing source code, they should:
    1. Obtain an Enterprise Commercial License directly from Ultralytics Inc.
    2. Alternatively, evaluate converting model weights to open formats (e.g. **ONNX**) and executing inference via open engines like `onnxruntime` (MIT License). Note that exporting model weights to ONNX alters runtime engine dependencies, but rights attached to original model training data/weights must still be reviewed independently.

---

## Attribution Requirements

1. **FarzadNekouee / Pothole Segmentation**:
   - Original work by Farzad Nekouee under MIT License.
2. **Ultralytics YOLOv8**:
   - Developed by Ultralytics Inc. under AGPL-3.0.
3. **OpenCV / PyTorch**:
   - OpenCV: Apache License 2.0.
   - PyTorch: BSD-style License.

---

## Commercial / Pre-Deployment Checklist

- [ ] Confirm open-source repository licenses match expected MIT/Apache-2.0 terms.
- [ ] Evaluate ONNX runtime export or commercial licensing if closed-source distribution is intended.
- [ ] Audit training dataset licenses (ensure CC BY or Public Domain compliance).
- [ ] Maintain non-surveillance privacy boundaries (road surface condition only, no facial or license-plate retention).

*Disclaimer: This document provides engineering analysis of open-source software licenses and does not constitute formal legal advice.*
