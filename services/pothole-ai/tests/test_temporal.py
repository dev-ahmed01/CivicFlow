import pytest
from app.schemas import (
    NormalizedBBox,
    PotholeDetection,
    FrameDetectionInput
)
from app.services.temporal import TemporalConfirmationEngine, calculate_bbox_iou

def create_sample_detection(x: float, y: float, w: float, h: float, conf: float = 0.90) -> PotholeDetection:
    return PotholeDetection(
        detectionId="det-1",
        label="pothole",
        confidence=conf,
        bbox=NormalizedBBox(x=x, y=y, width=w, height=h),
        polygon=[(x, y), (x + w, y), (x + w, y + h), (x, y + h)],
        visibleAreaRatio=round(w * h, 4),
        visualExtentCandidate="MEDIUM",
        visualSeverityCandidate="MEDIUM"
    )

def test_calculate_bbox_iou():
    box1 = NormalizedBBox(x=0.2, y=0.2, width=0.2, height=0.2)
    box2 = NormalizedBBox(x=0.2, y=0.2, width=0.2, height=0.2)
    assert calculate_bbox_iou(box1, box2) == 1.0

def test_temporal_engine_clusters_unique_frames():
    engine = TemporalConfirmationEngine(iou_threshold=0.30, min_repeat_frames=3)

    frames = [
        FrameDetectionInput(
            frameIndex=0,
            timestampSec=0.0,
            cameraId="CAM-01",
            detections=[create_sample_detection(0.35, 0.45, 0.10, 0.08, conf=0.88)]
        ),
        FrameDetectionInput(
            frameIndex=30,
            timestampSec=1.0,
            cameraId="CAM-01",
            detections=[create_sample_detection(0.36, 0.45, 0.10, 0.08, conf=0.92)]
        ),
        FrameDetectionInput(
            frameIndex=60,
            timestampSec=2.0,
            cameraId="CAM-01",
            detections=[create_sample_detection(0.35, 0.46, 0.11, 0.08, conf=0.90)]
        )
    ]

    response = engine.analyze_sequence(frames)
    assert response.totalFramesProcessed == 3
    assert len(response.confirmedClusters) == 1

    cluster = response.confirmedClusters[0]
    assert cluster.uniqueFrameCount == 3
    assert cluster.repeatCount == 3

def test_temporal_engine_does_not_double_count_same_frame_detections():
    engine = TemporalConfirmationEngine(iou_threshold=0.30, min_repeat_frames=3)

    # 1 frame containing 3 overlapping detections must NOT count as 3 unique frames!
    frames = [
        FrameDetectionInput(
            frameIndex=0,
            timestampSec=0.0,
            cameraId="CAM-01",
            detections=[
                create_sample_detection(0.35, 0.45, 0.10, 0.08, conf=0.88),
                create_sample_detection(0.36, 0.45, 0.10, 0.08, conf=0.90),
                create_sample_detection(0.35, 0.46, 0.11, 0.08, conf=0.91)
            ]
        )
    ]

    response = engine.analyze_sequence(frames)
    assert response.totalFramesProcessed == 1
    assert response.totalRawDetections == 3
    # Should NOT confirm cluster because uniqueFrameCount=1 < min_repeat_frames=3
    assert len(response.confirmedClusters) == 0

def test_temporal_engine_mixed_camera_ids_rejected():
    engine = TemporalConfirmationEngine(iou_threshold=0.30, min_repeat_frames=3)

    frames = [
        FrameDetectionInput(frameIndex=0, timestampSec=0.0, cameraId="CAM-01", detections=[]),
        FrameDetectionInput(frameIndex=30, timestampSec=1.0, cameraId="CAM-02", detections=[])
    ]

    with pytest.raises(ValueError, match="mixed camera IDs"):
        engine.analyze_sequence(frames)

def test_temporal_engine_multiple_spatial_clusters():
    engine = TemporalConfirmationEngine(iou_threshold=0.30, min_repeat_frames=3)

    # 3 frames each containing 2 distinct non-overlapping potholes (left and right)
    frames = [
        FrameDetectionInput(
            frameIndex=i*30,
            timestampSec=float(i),
            cameraId="CAM-01",
            detections=[
                create_sample_detection(0.15, 0.40, 0.10, 0.08, conf=0.90), # Pothole A (Left)
                create_sample_detection(0.75, 0.40, 0.10, 0.08, conf=0.92)  # Pothole B (Right)
            ]
        )
        for i in range(3)
    ]

    response = engine.analyze_sequence(frames)
    assert response.totalFramesProcessed == 3
    assert response.totalRawDetections == 6
    assert len(response.confirmedClusters) == 2

def test_temporal_engine_out_of_order_timestamps():
    engine = TemporalConfirmationEngine(iou_threshold=0.30, min_repeat_frames=3)

    # Out of order frames: timestamp 2.0s, 0.0s, 1.0s
    frames = [
        FrameDetectionInput(frameIndex=60, timestampSec=2.0, cameraId="CAM-01", detections=[create_sample_detection(0.35, 0.45, 0.10, 0.08)]),
        FrameDetectionInput(frameIndex=0, timestampSec=0.0, cameraId="CAM-01", detections=[create_sample_detection(0.35, 0.45, 0.10, 0.08)]),
        FrameDetectionInput(frameIndex=30, timestampSec=1.0, cameraId="CAM-01", detections=[create_sample_detection(0.35, 0.45, 0.10, 0.08)])
    ]

    response = engine.analyze_sequence(frames)
    assert response.totalFramesProcessed == 3
    assert len(response.confirmedClusters) == 1
    cluster = response.confirmedClusters[0]
    assert cluster.firstTimestampSec == 0.0
    assert cluster.lastTimestampSec == 2.0

