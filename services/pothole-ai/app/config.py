import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal, Optional

class Settings(BaseSettings):
    # Service Environment & Server
    port: int = 8000
    host: str = "0.0.0.0"
    env: str = "development"

    # Mode: "real" requires valid weights file; "demo" permits synthetic mock fallback
    pothole_ai_mode: Literal["real", "demo"] = "real"

    # Security: Server-to-Server Internal Token
    pothole_ai_internal_token: Optional[str] = "dev-secret-token-civicflow"
    allowed_origins: str = "http://localhost:3000,http://localhost:5000"

    # Model Settings
    model_path: str = "weights/yolov8n-seg-pothole.pt"
    confidence_threshold: float = 0.25
    device: str = "cpu"

    # Input Limits & Hardening
    max_upload_bytes: int = 10485760  # 10 MB limit
    max_image_dimension: int = 1920

    # Frame Quality Assessment Settings
    min_blur_score: float = 50.0
    min_brightness: float = 0.15
    max_brightness: float = 0.90

    # Temporal Confirmation Settings
    temporal_iou_threshold: float = 0.30
    temporal_time_window_sec: float = 30.0
    temporal_min_repeat_frames: int = 3

    # Verification Scan Settings
    verification_roi_iou_threshold: float = 0.30
    verification_min_confidence: float = 0.30
    verification_min_usable_frames: int = 3

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
