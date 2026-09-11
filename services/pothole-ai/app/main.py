import time
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import (
    DetectionResponse,
    HealthResponse,
    ModelMetadata,
    FrameDetectionInput,
    TemporalConfirmationResponse,
    VerificationScanRequest,
    VerificationScanResponse
)
from app.model.detector import PotholeDetector
from app.services.temporal import TemporalConfirmationEngine
from app.services.verification import VerificationScanEngine

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("pothole_ai.main")

detector: Optional[PotholeDetector] = None
temporal_engine: Optional[TemporalConfirmationEngine] = None
verification_engine: Optional[VerificationScanEngine] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for loading AI model and engines once on startup."""
    global detector, temporal_engine, verification_engine
    logger.info("Initializing Pothole AI Service resources...")
    detector = PotholeDetector(
        model_path=settings.model_path,
        device=settings.device,
        default_threshold=settings.confidence_threshold
    )
    temporal_engine = TemporalConfirmationEngine(
        iou_threshold=settings.temporal_iou_threshold,
        time_window_sec=settings.temporal_time_window_sec,
        min_repeat_frames=settings.temporal_min_repeat_frames
    )
    verification_engine = VerificationScanEngine(
        default_iou_threshold=settings.verification_roi_iou_threshold
    )
    logger.info(f"Pothole AI Service initialized. Model: {detector.model_name}, Loaded: {detector.is_loaded}")
    yield
    logger.info("Shutting down Pothole AI Service...")

app = FastAPI(
    title="City Connect - Pothole AI Detection Service",
    description="Request-triggered pothole instance segmentation & road defect verification microservice.",
    version="0.1.0",
    lifespan=lifespan
)

# Enable CORS for City Connect API & Web app origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global error handler to ensure clean structured JSON responses without exposing Python tracebacks."""
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal AI Service Error",
            "message": "An unexpected error occurred during inference processing.",
            "path": request.url.path
        }
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check readiness endpoint."""
    if detector is None or not detector.is_loaded:
        return HealthResponse(
            status="degraded",
            modelLoaded=False,
            modelName="Uninitialized",
            version="0.1.0",
            device=settings.device
        )
    return HealthResponse(
        status="ok",
        modelLoaded=detector.is_loaded,
        modelName=detector.model_name,
        version=detector.model_version,
        device=settings.device
    )

@app.post("/v1/detect/image", response_model=DetectionResponse)
async def detect_image(
    image: UploadFile = File(..., description="Image file (JPEG/PNG) to analyze"),
    camera_id: Optional[str] = Form(None, alias="camera_id"),
    captured_at: Optional[str] = Form(None, alias="captured_at"),
    request_id: Optional[str] = Form(None, alias="request_id"),
    confidence_threshold: Optional[float] = Form(None, alias="confidence_threshold")
):
    """
    Primary request-triggered image analysis endpoint.
    Performs pothole instance segmentation and returns normalized 0..1 bounding boxes and polygons.
    """
    if detector is None or not detector.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pothole AI model is not ready or failed to load."
        )

    start_time = time.perf_counter()

    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provided image file is empty."
            )

        threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold
        img_dims, detections = detector.detect_bytes(image_bytes, threshold=threshold)

        duration_ms = int((time.perf_counter() - start_time) * 1000)

        return DetectionResponse(
            requestId=request_id,
            cameraId=camera_id,
            capturedAt=captured_at,
            image=img_dims,
            detections=detections,
            model=ModelMetadata(
                name=detector.model_name,
                version=detector.model_version,
                threshold=threshold
            ),
            processingMs=duration_ms
        )
    except ValueError as ve:
        logger.warning(f"Bad image payload received: {ve}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during detection: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to execute pothole detection on image payload."
        )

@app.post("/v1/temporal/confirm", response_model=TemporalConfirmationResponse)
async def confirm_temporal_sequence(frames: List[FrameDetectionInput]):
    """
    Utility endpoint to analyze sequential frame detections from a static camera
    and confirm repeated observations of physical defects.
    """
    if temporal_engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal confirmation engine is uninitialized."
        )
    return temporal_engine.analyze_sequence(frames)

@app.post("/v1/verification/evaluate", response_model=VerificationScanResponse)
async def evaluate_verification_scan(request: VerificationScanRequest):
    """
    Utility endpoint to evaluate post-repair verification scan against pre-repair baseline detection.
    """
    if verification_engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification scan engine is uninitialized."
        )
    return verification_engine.evaluate(request)
