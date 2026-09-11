import uuid
import logging
from typing import List, Optional
from app.schemas import (
    NormalizedBBox,
    PotholeDetection,
    FrameDetectionInput,
    TemporalDefectCluster,
    TemporalConfirmationResponse
)

logger = logging.getLogger("pothole_ai.temporal")

def calculate_bbox_iou(box1: NormalizedBBox, box2: NormalizedBBox) -> float:
    """Calculate Intersection over Union (IoU) between two normalized bounding boxes."""
    x_left = max(box1.x, box2.x)
    y_top = max(box1.y, box2.y)
    x_right = min(box1.x + box1.width, box2.x + box2.width)
    y_bottom = min(box1.y + box1.height, box2.y + box2.height)

    inter_w = max(0.0, x_right - x_left)
    inter_h = max(0.0, y_bottom - y_top)
    inter_area = inter_w * inter_h

    area1 = box1.width * box1.height
    area2 = box2.width * box2.height
    union_area = area1 + area2 - inter_area

    if union_area <= 0:
        return 0.0
    return inter_area / union_area

def compute_visual_severity(ratio: float) -> str:
    if ratio < 0.005:
        return "LOW"
    elif ratio < 0.02:
        return "MEDIUM"
    else:
        return "HIGH"

class TemporalConfirmationEngine:
    def __init__(
        self,
        iou_threshold: float = 0.30,
        time_window_sec: float = 30.0,
        min_repeat_frames: int = 3
    ):
        self.iou_threshold = iou_threshold
        self.time_window_sec = time_window_sec
        self.min_repeat_frames = min_repeat_frames

    def analyze_sequence(
        self,
        frames: List[FrameDetectionInput],
        override_min_repeats: Optional[int] = None
    ) -> TemporalConfirmationResponse:
        """
        Process a list of sequential frame detections from a static camera feed
        and cluster detections corresponding to the same physical pothole.
        """
        min_repeats = override_min_repeats if override_min_repeats is not None else self.min_repeat_frames
        sorted_frames = sorted(frames, key=lambda f: f.timestampSec)

        clusters: List[dict] = []
        total_raw_detections = 0

        for frame in sorted_frames:
            for det in frame.detections:
                total_raw_detections += 1
                matched_cluster = None
                best_iou = 0.0

                # Search existing active clusters for IoU overlap within time window
                for cluster in clusters:
                    time_diff = frame.timestampSec - cluster["lastTimestampSec"]
                    if time_diff < 0 or time_diff > self.time_window_sec:
                        continue

                    iou = calculate_bbox_iou(det.bbox, cluster["canonicalBbox"])
                    if iou >= self.iou_threshold and iou > best_iou:
                        best_iou = iou
                        matched_cluster = cluster

                if matched_cluster is not None:
                    # Update cluster
                    matched_cluster["detections"].append(det)
                    matched_cluster["repeatCount"] += 1
                    matched_cluster["lastFrameIndex"] = frame.frameIndex
                    matched_cluster["lastTimestampSec"] = frame.timestampSec

                    # If this detection has higher confidence, update canonical polygon & bbox
                    if det.confidence > matched_cluster["highestConfidence"]:
                        matched_cluster["highestConfidence"] = det.confidence
                        matched_cluster["canonicalBbox"] = det.bbox
                        matched_cluster["canonicalPolygon"] = det.polygon

                    if det.visibleAreaRatio > matched_cluster["maxVisibleAreaRatio"]:
                        matched_cluster["maxVisibleAreaRatio"] = det.visibleAreaRatio
                else:
                    # Create new cluster
                    clusters.append({
                        "clusterId": f"cluster-{uuid.uuid4().hex[:8]}",
                        "repeatCount": 1,
                        "firstFrameIndex": frame.frameIndex,
                        "lastFrameIndex": frame.frameIndex,
                        "firstTimestampSec": frame.timestampSec,
                        "lastTimestampSec": frame.timestampSec,
                        "highestConfidence": det.confidence,
                        "detections": [det],
                        "canonicalBbox": det.bbox,
                        "canonicalPolygon": det.polygon,
                        "maxVisibleAreaRatio": det.visibleAreaRatio
                    })

        confirmed_clusters: List[TemporalDefectCluster] = []
        for c in clusters:
            if c["repeatCount"] >= min_repeats:
                avg_conf = sum(d.confidence for d in c["detections"]) / len(c["detections"])
                max_ratio = c["maxVisibleAreaRatio"]
                severity = compute_visual_severity(max_ratio)

                confirmed_clusters.append(TemporalDefectCluster(
                    clusterId=c["clusterId"],
                    repeatCount=c["repeatCount"],
                    firstFrameIndex=c["firstFrameIndex"],
                    lastFrameIndex=c["lastFrameIndex"],
                    firstTimestampSec=round(c["firstTimestampSec"], 2),
                    lastTimestampSec=round(c["lastTimestampSec"], 2),
                    averageConfidence=round(avg_conf, 4),
                    canonicalBbox=c["canonicalBbox"],
                    canonicalPolygon=c["canonicalPolygon"],
                    maxVisibleAreaRatio=round(max_ratio, 6),
                    visualSeverityCandidate=severity
                ))

        return TemporalConfirmationResponse(
            totalFramesProcessed=len(frames),
            totalRawDetections=total_raw_detections,
            confirmedClusters=confirmed_clusters
        )
