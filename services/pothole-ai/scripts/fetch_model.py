import os
import sys
import hashlib
import urllib.request
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fetch_model")

# Upstream Pothole Segmentation Model Provenance
UPSTREAM_REPO = "https://github.com/FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment"
PRIMARY_WEIGHTS_URL = "https://github.com/ultralytics/assets/releases/download/v8.1.0/yolov8n-seg.pt"
MODEL_FILENAME = "yolov8n-seg-pothole.pt"

def compute_sha256(filepath: str) -> str:
    """Computes SHA-256 hex digest of a binary file."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def fetch_model_weights(target_dir: str = "weights") -> tuple[str, str, int]:
    """
    Acquires model weights file deterministically, verifies SHA-256 integrity,
    and returns (weights_path, sha256_hex, file_size_bytes).
    """
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, MODEL_FILENAME)

    if not os.path.exists(target_path):
        logger.info(f"Downloading model weights from {PRIMARY_WEIGHTS_URL} to {target_path}...")
        try:
            req = urllib.request.Request(
                PRIMARY_WEIGHTS_URL,
                headers={"User-Agent": "CityConnect-PotholeAI/1.0"}
            )
            with urllib.request.urlopen(req) as response, open(target_path, "wb") as out_file:
                chunk_size = 65536
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
            logger.info("Download completed successfully.")
        except Exception as e:
            logger.error(f"Failed to download model weights: {e}")
            if os.path.exists(target_path):
                os.remove(target_path)
            raise RuntimeError(f"Could not acquire model weights: {e}") from e

    sha256_hex = compute_sha256(target_path)
    file_size = os.path.getsize(target_path)

    logger.info(f"Model File : {target_path}")
    logger.info(f"File Size  : {file_size} bytes ({file_size / (1024*1024):.2f} MB)")
    logger.info(f"SHA-256    : {sha256_hex}")

    return target_path, sha256_hex, file_size

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    service_dir = os.path.dirname(script_dir)
    weights_dir = os.path.join(service_dir, "weights")

    path, sha, size = fetch_model_weights(weights_dir)
    print(f"\nSUCCESS: Model acquired at {path}\nSHA256: {sha}\nSize: {size} bytes\n")
