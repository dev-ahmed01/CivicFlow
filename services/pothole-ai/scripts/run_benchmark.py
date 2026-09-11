import os
import sys

script_dir = os.path.dirname(os.path.abspath(__file__))
pothole_ai_dir = os.path.dirname(script_dir)
services_dir = os.path.dirname(pothole_ai_dir)
repo_root = os.path.dirname(services_dir)

if pothole_ai_dir not in sys.path:
    sys.path.insert(0, pothole_ai_dir)

import time
import json
import logging
from typing import List, Dict, Any

from app.config import settings
from app.model.detector import PotholeDetector
from fixtures.generate_fixtures import generate_all_fixtures



logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("benchmark")

def run_validation_benchmark(fixtures_dir: str, mode: str = "demo") -> Dict[str, Any]:
    """
    Executes a controlled benchmark across demo fixtures and calculates TP/FP/FN/TN metrics.
    """
    print(f"\n=================== RUNNING CONTROLLED VALIDATION BENCHMARK (Mode: {mode.upper()}) ===================")
    detector = PotholeDetector(mode=mode, model_path=settings.model_path)

    # Benchmark Ground Truth Dataset
    benchmark_dataset = [
        {"id": "cam_01_single", "file": "cam_01_single_pothole.jpg", "expectedCount": 1, "type": "POSITIVE"},
        {"id": "cam_02_multi", "file": "cam_02_multi_pothole.jpg", "expectedCount": 2, "type": "POSITIVE"},
        {"id": "cam_03_clear", "file": "cam_03_clear_road.jpg", "expectedCount": 0, "type": "NEGATIVE"},
        {"id": "cam_04_before", "file": "cam_04_before_repair.jpg", "expectedCount": 1, "type": "POSITIVE"},
        {"id": "cam_04_after", "file": "cam_04_after_repair.jpg", "expectedCount": 0, "type": "HARD_NEGATIVE"}
    ]

    tp, fp, fn, tn = 0, 0, 0, 0
    total_processing_ms = 0.0
    results_detail = []

    for sample in benchmark_dataset:
        filepath = os.path.join(fixtures_dir, sample["file"])
        if not os.path.exists(filepath):
            logger.warning(f"Fixture file missing: {filepath}")
            continue

        with open(filepath, "rb") as f:
            image_bytes = f.read()

        start = time.perf_counter()
        dims, detections = detector.detect_bytes(image_bytes)
        proc_ms = (time.perf_counter() - start) * 1000.0
        total_processing_ms += proc_ms

        det_count = len(detections)
        exp_count = sample["expectedCount"]

        if sample["type"] in ("POSITIVE",):
            if det_count > 0:
                tp += min(det_count, exp_count)
                if det_count > exp_count:
                    fp += (det_count - exp_count)
                elif det_count < exp_count:
                    fn += (exp_count - det_count)
            else:
                fn += exp_count
        else:  # NEGATIVE or HARD_NEGATIVE
            if det_count == 0:
                tn += 1
            else:
                fp += det_count

        results_detail.append({
            "sampleId": sample["id"],
            "filename": sample["file"],
            "sampleType": sample["type"],
            "expectedPotholes": exp_count,
            "detectedPotholes": det_count,
            "processingMs": round(proc_ms, 2)
        })

        print(f"  - [{sample['id']:<15}] Expected: {exp_count} | Detected: {det_count} | Latency: {proc_ms:.2f}ms")

    total_samples = len(benchmark_dataset)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    avg_latency = total_processing_ms / total_samples if total_samples > 0 else 0.0

    benchmark_summary = {
        "title": "Controlled Prototype Validation Report",
        "runtimeMode": detector.runtime_mode,
        "modelName": detector.model_name,
        "weightsSha256": detector.weights_sha256,
        "totalSamples": total_samples,
        "metrics": {
            "truePositives": tp,
            "falsePositives": fp,
            "falseNegatives": fn,
            "trueNegatives": tn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1Score": round(f1, 4),
            "averageProcessingMs": round(avg_latency, 2)
        },
        "sampleDetails": results_detail
    }

    print("\n---------------- BENCHMARK METRICS ----------------")
    print(f"True Positives (TP) : {tp}")
    print(f"False Positives (FP): {fp}")
    print(f"False Negatives (FN): {fn}")
    print(f"True Negatives (TN) : {tn}")
    print(f"Precision           : {precision * 100:.1f}%")
    print(f"Recall              : {recall * 100:.1f}%")
    print(f"F1 Score            : {f1:.4f}")
    print(f"Avg Latency         : {avg_latency:.2f} ms")
    print("----------------------------------------------------\n")

    return benchmark_summary

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    service_dir = os.path.dirname(script_dir)
    fixtures_dir = os.path.join(service_dir, "fixtures")

    generate_all_fixtures(fixtures_dir)
    mode_arg = sys.argv[1] if len(sys.argv) > 1 else "demo"
    summary = run_validation_benchmark(fixtures_dir, mode=mode_arg)

    # Write output report to docs/pothole-ai/CONTROLLED_VALIDATION.md
    docs_dir = os.path.join(repo_root, "docs", "pothole-ai")
    os.makedirs(docs_dir, exist_ok=True)
    report_file = os.path.join(docs_dir, "CONTROLLED_VALIDATION.md")





    md_content = f"""# Controlled Prototype Validation Benchmark

## Overview

This document presents the controlled validation benchmark metrics for the City Connect Pothole AI Service. 

> [!NOTE]
> **Label & Scope Disclaimer**:
> This benchmark evaluates prototype performance across controlled test fixtures (positive potholes, clear road surface, post-repair patches). It represents prototype verification metrics and does not make unverified claims regarding full-scale municipal camera deployment accuracy.

---

## Benchmark Results

- **Runtime Mode**: `{summary['runtimeMode']}`
- **Model Name**: `{summary['modelName']}`
- **Model SHA-256**: `{summary['weightsSha256'] or 'N/A (Demo)'}`
- **Total Test Samples**: `{summary['totalSamples']}`

### Confusion Matrix & Metrics

| Metric | Value |
|---|---|
| **True Positives (TP)** | `{summary['metrics']['truePositives']}` |
| **False Positives (FP)** | `{summary['metrics']['falsePositives']}` |
| **False Negatives (FN)** | `{summary['metrics']['falseNegatives']}` |
| **True Negatives (TN)** | `{summary['metrics']['trueNegatives']}` |
| **Precision** | `{summary['metrics']['precision'] * 100:.1f}%` |
| **Recall** | `{summary['metrics']['recall'] * 100:.1f}%` |
| **F1 Score** | `{summary['metrics']['f1Score']:.4f}` |
| **Average Processing Time** | `{summary['metrics']['averageProcessingMs']} ms` |

---

## Detailed Sample Evaluations

| Sample ID | Image File | Type | Expected Potholes | Detected Potholes | Latency (ms) |
|---|---|---|---|---|---|
"""
    for item in summary["sampleDetails"]:
        md_content += f"| `{item['sampleId']}` | `{item['filename']}` | `{item['sampleType']}` | `{item['expectedPotholes']}` | `{item['detectedPotholes']}` | `{item['processingMs']}` |\n"

    with open(report_file, "w", encoding="utf-8") as f:
        f.write(md_content)

    print(f"[BENCHMARK] Report written to: {report_file}")
