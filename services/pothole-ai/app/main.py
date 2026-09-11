import time
import secrets
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, status, Request, Header
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
from app.services.quality import QualityAssessor
from app.services.temporal import TemporalConfirmationEngine
from app.services.verification import VerificationScanEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("pothole_ai.main")

detector: Optional[PotholeDetector] = None
quality_assessor: Optional[QualityAssessor] = None
temporal_engine: Optional[TemporalConfirmationEngine] = None
verification_engine: Optional[VerificationScanEngine] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for initializing AI model and engines once on startup."""
    global detector, quality_assessor, temporal_engine, verification_engine
    logger.info(f"Initializing Pothole AI Service in mode: {settings.pothole_ai_mode.upper()}...")

    detector = PotholeDetector(
        mode=settings.pothole_ai_mode,
        model_path=settings.model_path,
        device=settings.device,
        default_threshold=settings.confidence_threshold,
        max_image_dimension=settings.max_image_dimension
    )
    quality_assessor = QualityAssessor(
        min_blur_score=settings.min_blur_score,
        min_brightness=settings.min_brightness,
        max_brightness=settings.max_brightness
    )
    temporal_engine = TemporalConfirmationEngine(
        iou_threshold=settings.temporal_iou_threshold,
        time_window_sec=settings.temporal_time_window_sec,
        min_repeat_frames=settings.temporal_min_repeat_frames
    )
    verification_engine = VerificationScanEngine(
        default_iou_threshold=settings.verification_roi_iou_threshold,
        min_confidence=settings.verification_min_confidence,
        min_usable_frames=settings.verification_min_usable_frames
    )

    if settings.pothole_ai_mode == "real" and not detector.is_loaded:
        logger.critical("CRITICAL READINESS FAILURE: REAL mode requested but model failed to load!")
    else:
        logger.info(f"Pothole AI Service initialized successfully. RuntimeMode={detector.runtime_mode}, Model={detector.model_name}")

    yield
    logger.info("Shutting down Pothole AI Service...")

app = FastAPI(
    title="City Connect - Pothole AI Detection Service",
    description="Request-triggered pothole instance segmentation & road defect verification microservice.",
    version="1.0.0",
    lifespan=lifespan
)

# Restrict CORS to configured internal API origins
origins_list = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

def verify_internal_token(x_internal_token: Optional[str] = Header(None, alias="X-Internal-Token")):
    """Server-to-server token authentication dependency for internal endpoints."""
    expected_token = settings.pothole_ai_internal_token
    insecure = not expected_token or expected_token.strip().lower() in {
        "change-me", "changeme", "dev-secret-token-civicflow", "secret", "test"
    }
    deployed = settings.pothole_ai_mode == "real" or settings.env.lower() not in {"development", "test"}
    if insecure or (deployed and len(expected_token or "") < 32):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Internal authentication is not configured securely.")

    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Missing or invalid X-Internal-Token authentication header."
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
    """Readiness probe endpoint distinguishing REAL vs DEMO runtime readiness."""
    if detector is None or not detector.is_loaded:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "contractVersion": "1.0",
                "status": "unhealthy",
                "runtimeMode": settings.pothole_ai_mode.upper(),
                "modelLoaded": False,
                "modelName": "Uninitialized" if detector is None else detector.model_name,
                "weightsSha256": None,
                "version": "1.0.0",
                "device": settings.device
            }
        )

    return HealthResponse(
        contractVersion="1.0",
        status="ok",
        runtimeMode=detector.runtime_mode,
        modelLoaded=detector.is_loaded,
        modelName=detector.model_name,
        weightsSha256=detector.weights_sha256,
        version=detector.model_version,
        device=settings.device
    )

@app.post("/v1/detect/image", response_model=DetectionResponse)
async def detect_image(
    image: UploadFile = File(..., description="Image file (JPEG/PNG) to analyze"),
    camera_id: Optional[str] = Form(None, alias="camera_id"),
    captured_at: Optional[str] = Form(None, alias="captured_at"),
    request_id: Optional[str] = Form(None, alias="request_id"),
    confidence_threshold: Optional[float] = Form(None, alias="confidence_threshold"),
    x_internal_token: Optional[str] = Header(None, alias="X-Internal-Token")
):
    """
    Primary request-triggered image analysis endpoint.
    Performs pothole instance segmentation, frame quality assessment, and returns normalized 0..1 coordinates.
    """
    verify_internal_token(x_internal_token)

    if detector is None or not detector.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Pothole AI model is not ready or failed to load."
        )

    start_time = time.perf_counter()

    if camera_id and len(camera_id) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="camera_id exceeds max length of 100 characters.")
    if request_id and len(request_id) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="request_id exceeds max length of 100 characters.")
    if confidence_threshold is not None and not (0.0 <= confidence_threshold <= 1.0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="confidence_threshold must be between 0.0 and 1.0.")

    allowed_content_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if image.content_type and image.content_type.lower() not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{image.content_type}'. Must be JPEG or PNG image."
        )

    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provided image file payload is empty.")

        if len(image_bytes) > settings.max_upload_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Uploaded image size ({len(image_bytes)} bytes) exceeds maximum limit ({settings.max_upload_bytes} bytes)."
            )

        threshold = confidence_threshold if confidence_threshold is not None else settings.confidence_threshold
        img_dims, detections = detector.detect_bytes(image_bytes, threshold=threshold)

        import io
        import numpy as np
        from PIL import Image
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        frame_quality = quality_assessor.assess_image(np.array(pil_img))

        duration_ms = int((time.perf_counter() - start_time) * 1000)

        return DetectionResponse(
            contractVersion="1.0",
            requestId=request_id,
            cameraId=camera_id,
            capturedAt=captured_at,
            image=img_dims,
            frameQuality=frame_quality,
            detections=detections,
            model=ModelMetadata(
                name=detector.model_name,
                version=detector.model_version,
                runtimeMode=detector.runtime_mode,
                weightsSha256=detector.weights_sha256,
                source=detector.source,
                threshold=threshold
            ),
            processingMs=duration_ms
        )
    except ValueError as ve:
        logger.warning(f"Bad image payload received: {ve}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during detection: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to execute pothole detection on image payload."
        )

@app.post("/v1/temporal/confirm", response_model=TemporalConfirmationResponse)
async def confirm_temporal_sequence(
    frames: List[FrameDetectionInput],
    x_internal_token: Optional[str] = Header(None, alias="X-Internal-Token")
):
    """
    Utility endpoint to analyze sequential frame detections from a single static camera
    and confirm repeated observations of physical defects across distinct frames.
    """
    verify_internal_token(x_internal_token)

    if temporal_engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Temporal confirmation engine is uninitialized."
        )
    try:
        return temporal_engine.analyze_sequence(frames)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

@app.post("/v1/verification/evaluate", response_model=VerificationScanResponse)
async def evaluate_verification_scan(
    request: VerificationScanRequest,
    x_internal_token: Optional[str] = Header(None, alias="X-Internal-Token")
):
    """
    Utility endpoint to evaluate post-repair multi-frame verification scan against pre-repair baseline detection.
    """
    verify_internal_token(x_internal_token)

    if verification_engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification scan engine is uninitialized."
        )
    return verification_engine.evaluate(request)
