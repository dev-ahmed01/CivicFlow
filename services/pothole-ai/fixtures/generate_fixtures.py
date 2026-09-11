import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def create_asphalt_texture(width: int = 1280, height: int = 720) -> Image.Image:
    """Generates a realistic asphalt road surface background image using PIL and NumPy."""
    # Dark gray base asphalt
    base = np.full((height, width, 3), (75, 78, 82), dtype=np.uint8)
    noise = np.random.normal(0, 10, (height, width, 3)).astype(np.float32)
    asphalt_np = np.clip(base.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    img = Image.fromarray(asphalt_np, mode="RGB")
    draw = ImageDraw.Draw(img)

    # Draw yellow perspective lane line
    lane_pts = [
        (width * 0.48, height * 0.20),
        (width * 0.52, height * 0.20),
        (width * 0.55, height),
        (width * 0.45, height)
    ]
    draw.polygon(lane_pts, fill=(240, 180, 30))
    return img

def draw_synthetic_pothole(img: Image.Image, bbox: tuple) -> Image.Image:
    """Draws a synthetic dark pothole cavity with rim texture onto a PIL road image."""
    result = img.copy()
    draw = ImageDraw.Draw(result)
    x1, y1, x2, y2 = bbox

    # Draw dark inner cavity
    draw.ellipse([x1, y1, x2, y2], fill=(22, 25, 28), outline=(110, 115, 120), width=2)
    return result

def generate_all_fixtures(output_dir: str):
    """Generates clean demo fixtures for Pothole AI testing."""
    os.makedirs(output_dir, exist_ok=True)
    print(f"[FIXTURES] Generating synthetic demo image fixtures in {output_dir}...")

    # 1. CAM-01: Single Pothole
    img1 = create_asphalt_texture()
    img1 = draw_synthetic_pothole(img1, (370, 435, 530, 525))
    img1.save(os.path.join(output_dir, "cam_01_single_pothole.jpg"), quality=90)

    # 2. CAM-02: Multiple Potholes
    img2 = create_asphalt_texture()
    img2 = draw_synthetic_pothole(img2, (280, 380, 420, 460))
    img2 = draw_synthetic_pothole(img2, (755, 465, 945, 575))
    img2.save(os.path.join(output_dir, "cam_02_multi_pothole.jpg"), quality=90)

    # 3. CAM-03: Clear Road Surface (Zero Potholes)
    img3 = create_asphalt_texture()
    img3.save(os.path.join(output_dir, "cam_03_clear_road.jpg"), quality=90)

    # 4. CAM-04: Before Repair (Pre-Repair Baseline)
    img4_before = create_asphalt_texture()
    img4_before = draw_synthetic_pothole(img4_before, (510, 430, 690, 530))
    img4_before.save(os.path.join(output_dir, "cam_04_before_repair.jpg"), quality=90)

    # 5. CAM-04: After Repair (Post-Repair Surface Patch)
    img4_after = create_asphalt_texture()
    draw4 = ImageDraw.Draw(img4_after)
    # Smooth dark gray asphalt patch over repair area
    draw4.ellipse([495, 420, 705, 540], fill=(55, 58, 62), outline=(95, 100, 105), width=2)
    img4_after.save(os.path.join(output_dir, "cam_04_after_repair.jpg"), quality=90)

    print("[FIXTURES] All 5 demo fixtures generated successfully.")

if __name__ == "__main__":
    fixtures_dir = os.path.dirname(os.path.abspath(__file__))
    generate_all_fixtures(fixtures_dir)

