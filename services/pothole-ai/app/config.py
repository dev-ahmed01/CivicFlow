import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal

class Settings(BaseSettings):
    port: int = 8000
    host: str = "0.0.0.0"
    env: str = "development"

    model_path: str = "weights/yolov8n-seg-pothole.pt"
    confidence_threshold: float = 0.25
    device: str = "cpu"
    max_image_dimension: int = 1920

    temporal_iou_threshold: float = 0.30
    temporal_time_window_sec: float = 30.0
    temporal_min_repeat_frames: int = 3

    verification_roi_iou_threshold: float = 0.30
    verification_min_confidence: float = 0.30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
