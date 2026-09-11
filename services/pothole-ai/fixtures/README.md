# Demo Test Fixtures

This directory contains clean, programmatically generated test images representing realistic road camera feeds for testing and demonstration of the Pothole AI Service.

## Available Fixtures

- `cam_01_single_pothole.jpg`: Standard road camera view containing a single clear pothole defect.
- `cam_02_multi_pothole.jpg`: Road camera view containing multiple distinct potholes across lane boundaries.
- `cam_03_clear_road.jpg`: Clear road surface with zero pothole defects.
- `cam_04_before_repair.jpg`: Baseline static camera frame before engineer pothole repair.
- `cam_04_after_repair.jpg`: Verification scan frame from the same static camera after engineer repair completion (shows smooth asphalt patch, 0 potholes).

## Regenerating Fixtures

To regenerate synthetic fixtures offline at any time:

```bash
python fixtures/generate_fixtures.py
```
