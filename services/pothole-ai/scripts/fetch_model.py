import os
import sys
import hashlib
import urllib.request
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fetch_model")

# Upstream Model Provenance
UPSTREAM_REPO = "https://github.com/FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment"
PRIMARY_WEIGHTS_URL = "https://raw.githubusercontent.com/FarzadNekouee/YOLOv8_Pothole_Segmentation_Road_Damage_Assessment/master/model/best.pt"

# Upstream Model Integrity Parameters
EXPECTED_SHA256 = "04b05396b38dfe0801c3db2e4cc8c77e23b23c024a4cea37fce8295660817704"
EXPECTED_BYTE_SIZE = 6792824
MODEL_FILENAME = "yolov8n-seg-pothole.pt"
ALT_FILENAME = "best.pt"

def compute_sha256(filepath: str) -> str:
    """Computes SHA-256 hex digest of a binary file."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def fetch_model_weights(target_dir: str = "weights") -> tuple[str, str, int]:
    """
    Acquires trained pothole segmentation model weights deterministically,
    verifies SHA-256 checksum integrity against EXPECTED_SHA256,
    and returns (weights_path, sha256_hex, file_size_bytes).
    """
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, MODEL_FILENAME)
    alt_path = os.path.join(target_dir, ALT_FILENAME)

    # Check if existing weights match expected SHA-256
    if os.path.exists(target_path):
        current_sha = compute_sha256(target_path)
        if current_sha == EXPECTED_SHA256:
            logger.info(f"Verified existing weights file '{target_path}' (SHA-256: {current_sha}).")
            return target_path, current_sha, os.path.getsize(target_path)
        else:
            logger.warning(f"Existing weights SHA-256 mismatch ({current_sha} != {EXPECTED_SHA256}). Re-downloading...")
            os.remove(target_path)

    logger.info(f"Downloading upstream pothole segmentation weights from {PRIMARY_WEIGHTS_URL}...")
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
        raise RuntimeError(f"Could not acquire model weights from upstream: {e}") from e

    # Integrity verification
    actual_sha = compute_sha256(target_path)
    actual_size = os.path.getsize(target_path)

    if actual_sha != EXPECTED_SHA256:
        os.remove(target_path)
        raise ValueError(f"SECURITY INTEGRITY FAILURE: Downloaded weights SHA-256 '{actual_sha}' does not match expected SHA-256 '{EXPECTED_SHA256}'. File deleted.")

    # Also keep best.pt alias
    with open(target_path, "rb") as src, open(alt_path, "wb") as dst:
        dst.write(src.read())

    logger.info(f"Verified Model File : {target_path}")
    logger.info(f"Verified File Size  : {actual_size} bytes ({actual_size / (1024*1024):.2f} MB)")
    logger.info(f"Verified SHA-256    : {actual_sha}")

    return target_path, actual_sha, actual_size

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    service_dir = os.path.dirname(script_dir)
    weights_dir = os.path.join(service_dir, "weights")

    path, sha, size = fetch_model_weights(weights_dir)
    print(f"\nSUCCESS: Verified pothole weights acquired at {path}\nSHA256: {sha}\nSize: {size} bytes\n")
