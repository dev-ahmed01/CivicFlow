import os
import sys
import json
import time
import urllib.request
import urllib.parse
from PIL import Image
import numpy as np

# Ensure app package is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.model.detector import PotholeDetector, compute_sha256

def download_image(url: str, dest_path: str):
    """Downloads an image from a URL with standard User-Agent headers."""
    # Clean URL (strip tracking params if needed, or quote properly)
    clean_url = url.split('?')[0] if '?' in url else url
    req = urllib.request.Request(clean_url, headers={'User-Agent': 'CivicFlow-AI-Validation/1.0 (contact@civicflow.org)'})
    with urllib.request.urlopen(req) as response, open(dest_path, 'wb') as out_file:
        out_file.write(response.read())

def run_validation():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    val_dir = os.path.join(base_dir, "validation", "real")
    img_dir = os.path.join(val_dir, "images")
    out_dir = os.path.join(val_dir, "outputs")
    weights_path = os.path.join(base_dir, "weights", "yolov8n-seg-pothole.pt")

    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    # Dataset definition: 5 real positive photographs + 3 real negative/hard-negative photographs
    samples = [
        {
            "id": "real_sample_01",
            "title": "A photo of a pothole",
            "url": "https://upload.wikimedia.org/wikipedia/commons/8/82/A_photo_of_a_pothole_2021-07-11.jpg",
            "license": "CC BY-SA 4.0",
            "artist": "Wikimedia Commons User",
            "expected_label": "pothole",
            "description": "Obvious single pothole on asphalt road"
        },
        {
            "id": "real_sample_02",
            "title": "A pothole in Dilova Street in Kyiv",
            "url": "https://upload.wikimedia.org/wikipedia/commons/a/ad/A_pothole_in_Dilova_Street_in_Kyiv.jpg",
            "license": "CC0",
            "artist": "Wikimedia Commons User",
            "expected_label": "pothole",
            "description": "Urban street pothole with asphalt degradation"
        },
        {
            "id": "real_sample_03",
            "title": "Pothole Big",
            "url": "https://upload.wikimedia.org/wikipedia/commons/c/c7/Pothole_Big.jpg",
            "license": "Public domain",
            "artist": "Public Domain",
            "expected_label": "pothole",
            "description": "Large deep road cavity on asphalt"
        },
        {
            "id": "real_sample_04",
            "title": "Pothole in Potomac after rain",
            "url": "https://upload.wikimedia.org/wikipedia/commons/2/29/Pothole_in_Potomac_after_rain.jpg",
            "license": "CC BY-SA 4.0",
            "artist": "Wikimedia Commons User",
            "expected_label": "pothole",
            "description": "Pothole filled with water/puddle reflection (difficult case)"
        },
        {
            "id": "real_sample_05",
            "title": "Pothole in an asphalt pavement",
            "url": "https://upload.wikimedia.org/wikipedia/commons/b/b3/Pothole_in_an_asphalt_pavement.jpg",
            "license": "CC BY-SA 4.0",
            "artist": "Wikimedia Commons User",
            "expected_label": "pothole",
            "description": "Textured asphalt surface with edge degradation"
        },
        {
            "id": "real_sample_06",
            "title": "Asphalt road surface clear",
            "url": "https://upload.wikimedia.org/wikipedia/commons/b/b5/Asphalt_road_surface_%28Unsplash%29.jpg",
            "license": "CC0",
            "artist": "Unsplash / Wikimedia Commons",
            "expected_label": "clear",
            "description": "Clean undamaged asphalt road surface (Negative)"
        },
        {
            "id": "real_sample_07",
            "title": "Damaged asphalt surface cracked",
            "url": "https://upload.wikimedia.org/wikipedia/commons/b/be/Damaged_asphalt_surface_1.jpg",
            "license": "CC0",
            "artist": "Public Domain / Wikimedia",
            "expected_label": "clear",
            "description": "Cracked road surface without pothole cavity (Hard Negative)"
        },
        {
            "id": "real_sample_08",
            "title": "Damaged road surface background Spain",
            "url": "https://upload.wikimedia.org/wikipedia/commons/f/fd/002_Damaged_road_surface_background_-_cracked_asphalt_blacktop_in_Spain.jpg",
            "license": "CC BY 3.0",
            "artist": "Wikimedia Commons User",
            "expected_label": "clear",
            "description": "Cracked blacktop without severe depth cavity (Hard Negative)"
        }
    ]

    print("[REAL VALIDATION] Initializing REAL YOLO Detector with verified weights...")
    detector = PotholeDetector(mode="real", model_path=weights_path)
    if not detector.is_loaded:
        print(f"ERROR: REAL model failed to load from {weights_path}")
        sys.exit(1)

    model_sha = detector.weights_sha256
    print(f"[REAL VALIDATION] REAL YOLO Model Loaded. SHA-256: {model_sha}")
    print(f"[REAL VALIDATION] Processing {len(samples)} real road validation photographs...")

    manifest_records = []
    tp, fp, fn, tn = 0, 0, 0, 0

    for s in samples:
        filename = f"{s['id']}.jpg"
        img_path = os.path.join(img_dir, filename)

        if not os.path.exists(img_path):
            print(f"  - Downloading {s['id']} ({s['title']})...")
            try:
                download_image(s["url"], img_path)
            except Exception as e:
                print(f"  - WARNING: Failed to download {s['id']} from {s['url']}: {e}")
                continue

        # Load image bytes
        with open(img_path, "rb") as f:
            image_bytes = f.read()

        t0 = time.time()
        dims, detections = detector.detect_bytes(image_bytes, threshold=0.25)
        proc_ms = int((time.time() - t0) * 1000)

        num_detections = len(detections)
        has_pothole_detected = num_detections > 0
        confidences = [d.confidence for d in detections]

        expected_positive = (s["expected_label"] == "pothole")
        correct = (has_pothole_detected == expected_positive)

        if expected_positive and has_pothole_detected:
            tp += 1
            outcome = "TP (True Positive)"
        elif not expected_positive and has_pothole_detected:
            fp += 1
            outcome = "FP (False Positive)"
        elif expected_positive and not has_pothole_detected:
            fn += 1
            outcome = "FN (False Negative)"
        else:
            tn += 1
            outcome = "TN (True Negative)"

        print(f"  [{s['id']}] {s['expected_label'].upper()} | Detected: {num_detections} | Conf: {confidences} | Time: {proc_ms}ms | Outcome: {outcome}")

        # Construct machine-generated output JSON
        raw_output = {
            "sampleId": s["id"],
            "title": s["title"],
            "sourceUrl": s["url"],
            "license": s["license"],
            "description": s["description"],
            "expectedLabel": s["expected_label"],
            "imageDimensions": {
                "width": dims.width,
                "height": dims.height
            },
            "runtimeMode": detector.runtime_mode,
            "modelFilename": detector.model_name,
            "weightsSha256": model_sha,
            "processingMs": proc_ms,
            "numDetections": num_detections,
            "detections": [d.model_dump() for d in detections],
            "potholeDetected": has_pothole_detected,
            "evaluationOutcome": outcome
        }

        # Save individual raw response JSON
        out_json_path = os.path.join(out_dir, f"{s['id']}.json")
        with open(out_json_path, "w", encoding="utf-8") as f:
            json.dump(raw_output, f, indent=2)

        manifest_records.append({
            "sampleId": s["id"],
            "source": s["url"],
            "license": s["license"],
            "expectedLabel": s["expected_label"],
            "width": dims.width,
            "height": dims.height,
            "runtimeMode": detector.runtime_mode,
            "modelFilename": detector.model_name,
            "weightsSha256": model_sha,
            "numDetections": num_detections,
            "confidences": confidences,
            "processingMs": proc_ms,
            "potholeDetected": has_pothole_detected,
            "evaluationOutcome": outcome
        })

    total_evaluated = tp + fp + fn + tn
    precision = (tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = (tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

    print("\n==================================================")
    print("REAL IMAGE MODEL CONTROLLED VALIDATION SUMMARY")
    print("==================================================")
    print(f"Total Evaluated Samples : {total_evaluated}")
    print(f"True Positives (TP)     : {tp}")
    print(f"False Positives (FP)    : {fp}")
    print(f"False Negatives (FN)    : {fn}")
    print(f"True Negatives (TN)     : {tn}")
    print(f"Validation Sum Check    : TP({tp}) + FP({fp}) + FN({fn}) + TN({tn}) = {total_evaluated}")
    print(f"Precision               : {precision * 100:.1f}%")
    print(f"Recall                  : {recall * 100:.1f}%")
    print(f"F1 Score                : {f1:.4f}")
    print("==================================================\n")

    manifest = {
        "validationType": "REAL_IMAGE_MODEL_VALIDATION",
        "methodology": "IMAGE_LEVEL_CLASSIFICATION",
        "modelMetadata": {
            "modelFilename": detector.model_name,
            "runtimeMode": detector.runtime_mode,
            "weightsSha256": model_sha,
            "upstreamSource": detector.source
        },
        "confusionMatrix": {
            "totalSamples": total_evaluated,
            "truePositives": tp,
            "falsePositives": fp,
            "falseNegatives": fn,
            "trueNegatives": tn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1Score": round(f1, 4)
        },
        "disclaimer": "Controlled prototype validation on a 8-sample dataset. Sample size is small and is not representative of municipal-scale camera performance under all lighting/weather conditions.",
        "samples": manifest_records
    }

    manifest_path = os.path.join(val_dir, "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"[REAL VALIDATION] Manifest saved at {manifest_path}")

if __name__ == "__main__":
    run_validation()
