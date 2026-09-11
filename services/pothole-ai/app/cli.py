import os
import sys
import json
import argparse
import time
import numpy as np
from typing import List, Dict, Any

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

from app.config import settings
from app.schemas import FrameDetectionInput, PotholeDetection
from app.model.detector import PotholeDetector
from app.services.quality import QualityAssessor
from app.services.temporal import TemporalConfirmationEngine

def draw_annotations(img_bgr: np.ndarray, detections: List[PotholeDetection]) -> np.ndarray:
    """Renders visual overlay bounding boxes, polygons, and confidence labels onto image frame."""
    if not HAS_CV2:
        return img_bgr

    annotated = img_bgr.copy()
    height, width = annotated.shape[:2]

    for det in detections:
        bx = int(det.bbox.x * width)
        by = int(det.bbox.y * height)
        bw = int(det.bbox.width * width)
        bh = int(det.bbox.height * height)

        poly_pts = np.array([
            [int(px * width), int(py * height)] for px, py in det.polygon
        ], dtype=np.int32)

        if len(poly_pts) >= 3:
            overlay = annotated.copy()
            cv2.fillPoly(overlay, [poly_pts], (0, 0, 255))
            cv2.addWeighted(overlay, 0.35, annotated, 0.65, 0, annotated)
            cv2.polylines(annotated, [poly_pts], True, (0, 0, 255), 2)

        cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), (0, 255, 255), 2)
        label_text = f"Pothole {det.confidence:.2f} ({det.visualExtentCandidate})"
        cv2.putText(
            annotated,
            label_text,
            (bx, max(20, by - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2,
            cv2.LINE_AA
        )

    return annotated

def process_video_file(
    video_path: str,
    camera_id: str = "CAM-CLI-01",
    output_video_path: str = None,
    output_json_path: str = None,
    sample_interval_sec: float = 1.0,
    confidence_threshold: float = 0.25,
    min_repeat_frames: int = 3,
    mode: str = "demo"
):
    """
    Reads a prerecorded video file frame-by-frame, samples frames at sample_interval_sec,
    executes pothole segmentation, performs temporal confirmation across frames,
    and renders an annotated demo video and comprehensive JSON detection report.
    """
    if not HAS_CV2:
        print("[ERROR] Processing video files requires OpenCV (cv2). Please install 'opencv-python-headless'.")
        sys.exit(1)

    print(f"[CLI] Opening video file: {video_path} (Camera ID: {camera_id})")
    if not os.path.exists(video_path):
        print(f"[ERROR] Video file not found: {video_path}")
        sys.exit(1)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Failed to open video file: {video_path}")
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30.0

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_step = max(1, int(fps * sample_interval_sec))

    print(f"[CLI] Video details: FPS={fps:.1f}, Total Frames={total_frames}, Frame Sample Step={frame_step}")

    detector = PotholeDetector(
        mode=mode,
        model_path=settings.model_path,
        device=settings.device,
        default_threshold=confidence_threshold
    )
    quality_assessor = QualityAssessor(
        min_blur_score=settings.min_blur_score,
        min_brightness=settings.min_brightness,
        max_brightness=settings.max_brightness
    )
    temporal_engine = TemporalConfirmationEngine(
        iou_threshold=settings.temporal_iou_threshold,
        time_window_sec=settings.temporal_time_window_sec,
        min_repeat_frames=min_repeat_frames
    )

    out_video_writer = None
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    if output_video_path:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out_video_writer = cv2.VideoWriter(output_video_path, fourcc, fps / frame_step, (frame_width, frame_height))
        print(f"[CLI] Writing annotated video to: {output_video_path}")

    frame_inputs: List[FrameDetectionInput] = []
    usable_frame_count = 0
    rejected_frame_count = 0
    current_frame_idx = 0

    start_time = time.time()

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if current_frame_idx % frame_step == 0:
            timestamp_sec = round(current_frame_idx / fps, 2)
            frame_quality = quality_assessor.assess_image(frame)

            if frame_quality.usable:
                usable_frame_count += 1
            else:
                rejected_frame_count += 1

            img_dims, detections = detector.detect_numpy_image(frame, threshold=confidence_threshold)

            frame_input = FrameDetectionInput(
                frameIndex=current_frame_idx,
                timestampSec=timestamp_sec,
                cameraId=camera_id,
                frameQuality=frame_quality,
                detections=detections
            )
            frame_inputs.append(frame_input)

            print(f"[FRAME {current_frame_idx:05d} | {timestamp_sec:05.1f}s] Usable: {frame_quality.usable} | Detections: {len(detections)}")

            if out_video_writer:
                annotated_frame = draw_annotations(frame, detections)
                out_video_writer.write(annotated_frame)

        current_frame_idx += 1

    cap.release()
    if out_video_writer:
        out_video_writer.release()

    elapsed = round(time.time() - start_time, 2)
    temporal_summary = temporal_engine.analyze_sequence(frame_inputs, override_min_repeats=min_repeat_frames)

    report = {
        "contractVersion": "1.0",
        "videoSource": os.path.basename(video_path),
        "cameraId": camera_id,
        "runtimeMode": detector.runtime_mode,
        "modelName": detector.model_name,
        "weightsSha256": detector.weights_sha256,
        "totalVideoFrames": total_frames,
        "sampledFrames": len(frame_inputs),
        "usableFrames": usable_frame_count,
        "rejectedFrames": rejected_frame_count,
        "sampleIntervalSec": sample_interval_sec,
        "processingTimeSec": elapsed,
        "temporalSummary": temporal_summary.model_dump()
    }

    print("\n=================== DEMO SCAN REPORT ===================")
    print(f"Camera ID                : {camera_id}")
    print(f"Runtime Mode             : {detector.runtime_mode}")
    print(f"Model Name               : {detector.model_name}")
    print(f"Sampled Frames Processed : {len(frame_inputs)} (Usable: {usable_frame_count}, Rejected: {rejected_frame_count})")
    print(f"Total Raw Detections     : {temporal_summary.totalRawDetections}")
    print(f"Confirmed Defect Clusters: {len(temporal_summary.confirmedClusters)}")
    for cluster in temporal_summary.confirmedClusters:
        print(f"  - Defect {cluster.clusterId}: Observed in {cluster.uniqueFrameCount} distinct frames (First: {cluster.firstTimestampSec}s, Last: {cluster.lastTimestampSec}s, AvgConf: {cluster.averageConfidence:.2f}, Extent: {cluster.visualExtentCandidate})")
    print("========================================================\n")

    if output_json_path:
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(f"[CLI] Detection report saved to: {output_json_path}")

def main():
    parser = argparse.ArgumentParser(description="City Connect Pothole AI - Prerecorded Video Scanner CLI")
    parser.add_argument("--video", type=str, required=True, help="Path to prerecorded video file")
    parser.add_argument("--camera-id", type=str, default="CAM-CLI-01", help="Camera identifier (default: CAM-CLI-01)")
    parser.add_argument("--mode", type=str, default="demo", choices=["real", "demo"], help="Runtime mode: real or demo")
    parser.add_argument("--out-video", type=str, default=None, help="Optional output path for annotated video")
    parser.add_argument("--out-json", type=str, default=None, help="Optional output path for JSON report")
    parser.add_argument("--sample-interval", type=float, default=1.0, help="Frame sampling interval in seconds (default: 1.0)")
    parser.add_argument("--threshold", type=float, default=0.25, help="Confidence threshold (default: 0.25)")
    parser.add_argument("--min-repeats", type=int, default=3, help="Minimum repeated frame observations to confirm defect (default: 3)")

    args = parser.parse_args()
    process_video_file(
        video_path=args.video,
        camera_id=args.camera_id,
        output_video_path=args.out_video,
        output_json_path=args.out_json,
        sample_interval_sec=args.sample_interval,
        confidence_threshold=args.threshold,
        min_repeat_frames=args.min_repeats,
        mode=args.mode
    )

if __name__ == "__main__":
    main()
