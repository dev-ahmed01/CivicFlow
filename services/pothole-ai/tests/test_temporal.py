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
        visualSeverityCandidate="MEDIUM"
    )

def test_calculate_bbox_iou():
    box1 = NormalizedBBox(x=0.2, y=0.2, width=0.2, height=0.2)
    box2 = NormalizedBBox(x=0.2, y=0.2, width=0.2, height=0.2)
    assert calculate_bbox_iou(box1, box2) == 1.0

    # Half overlap
    box3 = NormalizedBBox(x=0.2, y=0.2, width=0.2, height=0.2)
    box4 = NormalizedBBox(x=0.3, y=0.2, width=0.2, height=0.2)
    iou = calculate_bbox_iou(box3, box4)
    assert 0.3 < iou < 0.4

    # No overlap
    box5 = NormalizedBBox(x=0.5, y=0.5, width=0.1, height=0.1)
    assert calculate_bbox_iou(box1, box5) == 0.0

def test_temporal_engine_clusters_repeated_defect():
    engine = TemporalConfirmationEngine(iou_threshold=0.30, min_repeat_frames=3)

    # 4 frames showing same defect around x=0.35, y=0.45
    frames = [
        FrameDetectionInput(
            frameIndex=0,
            timestampSec=0.0,
            detections=[create_sample_detection(0.35, 0.45, 0.10, 0.08, conf=0.88)]
        ),
        FrameDetectionInput(
            frameIndex=30,
            timestampSec=1.0,
            detections=[create_sample_detection(0.36, 0.45, 0.10, 0.08, conf=0.92)]
        ),
        FrameDetectionInput(
            frameIndex=60,
            timestampSec=2.0,
            detections=[create_sample_detection(0.35, 0.46, 0.11, 0.08, conf=0.90)]
        ),
        FrameDetectionInput(
            frameIndex=90,
            timestampSec=3.0,
            detections=[create_sample_detection(0.35, 0.45, 0.10, 0.08, conf=0.94)]
        )
    ]

    response = engine.analyze_sequence(frames)
    assert response.totalFramesProcessed == 4
    assert response.totalRawDetections == 4
    assert len(response.confirmedClusters) == 1

    cluster = response.confirmedClusters[0]
    assert cluster.repeatCount == 4
    assert cluster.firstTimestampSec == 0.0
    assert cluster.lastTimestampSec == 3.0
    assert cluster.averageConfidence > 0.90

def test_temporal_engine_ignores_noisy_single_frame():
    engine = TemporalConfirmationEngine(iou_threshold=0.30, min_repeat_frames=3)

    frames = [
        FrameDetectionInput(
            frameIndex=0,
            timestampSec=0.0,
            detections=[create_sample_detection(0.10, 0.10, 0.05, 0.05, conf=0.70)]
        )
    ]

    response = engine.analyze_sequence(frames)
    assert response.totalFramesProcessed == 1
    assert response.totalRawDetections == 1
    # Should not produce confirmed cluster because repeatCount=1 < min_repeat_frames=3
    assert len(response.confirmedClusters) == 0
