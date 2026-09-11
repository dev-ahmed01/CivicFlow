from pydantic import BaseModel, Field, field_validator
from typing import List, Tuple, Optional, Literal

class NormalizedBBox(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0, description="Normalized top-left X coordinate (0.0 to 1.0)")
    y: float = Field(..., ge=0.0, le=1.0, description="Normalized top-left Y coordinate (0.0 to 1.0)")
    width: float = Field(..., ge=0.0, le=1.0, description="Normalized box width (0.0 to 1.0)")
    height: float = Field(..., ge=0.0, le=1.0, description="Normalized box height (0.0 to 1.0)")

class ImageDimensions(BaseModel):
    width: int = Field(..., gt=0, description="Original image width in pixels")
    height: int = Field(..., gt=0, description="Original image height in pixels")

class FrameQualityInfo(BaseModel):
    usable: bool = Field(..., description="True if frame passes blur and luminance thresholds")
    blurScore: float = Field(..., description="Variance of Laplacian or gradient score")
    brightnessScore: float = Field(..., description="Normalized luminance (0.0 to 1.0)")
    reasons: List[str] = Field(default=[], description="List of quality issues: TOO_BLURRY, TOO_DARK, OVEREXPOSED")

class PotholeDetection(BaseModel):
    detectionId: str = Field(..., description="Unique generated detection UUID")
    label: str = Field(default="pothole", description="Detection class label")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model prediction confidence score")
    bbox: NormalizedBBox = Field(..., description="Normalized bounding box (0.0 to 1.0)")
    polygon: List[Tuple[float, float]] = Field(
        ...,
        description="Normalized polygon contour points [[x1, y1], [x2, y2], ...] (0.0 to 1.0)"
    )
    visibleAreaRatio: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Normalized area ratio of pothole mask relative to total image area"
    )
    visualExtentCandidate: Literal["LOW", "MEDIUM", "HIGH"] = Field(
        ...,
        description="Relative visible image extent cutoff (LOW < 0.5%, MEDIUM 0.5-2.0%, HIGH > 2.0%); NOT physical depth/severity"
    )
    visualSeverityCandidate: Optional[Literal["LOW", "MEDIUM", "HIGH"]] = Field(
        default=None,
        description="Deprecated alias for visualExtentCandidate provided for backwards compatibility"
    )

class ModelMetadata(BaseModel):
    name: str = Field(..., description="Name of AI model")
    version: str = Field(..., description="Model version")
    runtimeMode: Literal["REAL", "DEMO"] = Field(..., description="Explicit runtime mode: REAL (YOLO weights) or DEMO (synthetic)")
    weightsSha256: Optional[str] = Field(default=None, description="SHA-256 hash of loaded model weights")
    source: str = Field(..., description="Upstream repository or source identifier")
    threshold: float = Field(..., description="Confidence threshold used for filtering")

class DetectionResponse(BaseModel):
    contractVersion: str = Field(default="1.0", description="API contract version")
    requestId: Optional[str] = Field(default=None, description="Optional request tracking identifier")
    cameraId: Optional[str] = Field(default=None, description="Optional camera identifier")
    capturedAt: Optional[str] = Field(default=None, description="Optional capture ISO timestamp")
    image: ImageDimensions = Field(..., description="Original image resolution metadata")
    frameQuality: FrameQualityInfo = Field(..., description="Deterministic frame quality assessment")
    detections: List[PotholeDetection] = Field(..., description="List of detected potholes")
    model: ModelMetadata = Field(..., description="Model runtime and provenance metadata")
    processingMs: int = Field(..., ge=0, description="Inference processing duration in milliseconds")

class HealthResponse(BaseModel):
    contractVersion: str = Field(default="1.0", description="API contract version")
    status: Literal["ok", "degraded", "unhealthy"] = Field(...)
    runtimeMode: Literal["REAL", "DEMO"] = Field(...)
    modelLoaded: bool = Field(...)
    modelName: str = Field(...)
    weightsSha256: Optional[str] = Field(default=None)
    version: str = Field(...)
    device: str = Field(...)

# Temporal Confirmation Schemas
class FrameDetectionInput(BaseModel):
    frameIndex: int
    timestampSec: float
    cameraId: Optional[str] = None
    frameQuality: Optional[FrameQualityInfo] = None
    detections: List[PotholeDetection]

class TemporalDefectCluster(BaseModel):
    clusterId: str
    uniqueFrameCount: int = Field(..., description="Count of DISTINCT frames observing this physical defect")
    repeatCount: int = Field(..., description="Deprecated alias for uniqueFrameCount")
    firstFrameIndex: int
    lastFrameIndex: int
    firstTimestampSec: float
    lastTimestampSec: float
    averageConfidence: float
    canonicalBbox: NormalizedBBox
    canonicalPolygon: List[Tuple[float, float]]
    maxVisibleAreaRatio: float
    visualExtentCandidate: Literal["LOW", "MEDIUM", "HIGH"]

class TemporalConfirmationResponse(BaseModel):
    totalFramesProcessed: int
    totalRawDetections: int
    confirmedClusters: List[TemporalDefectCluster]

# Verification Scan Schemas
class VerificationScanRequest(BaseModel):
    baselineDetection: PotholeDetection
    baselineCameraId: Optional[str] = None
    currentCameraId: str
    currentFrames: List[FrameDetectionInput] = Field(..., description="List of post-repair verification frames")
    iouThreshold: float = Field(default=0.30)
    minUsableFrames: int = Field(default=3)

class VerificationScanResponse(BaseModel):
    verificationStatus: Literal["DEFECT_STILL_DETECTED", "NO_MATCHING_DEFECT_DETECTED", "INCONCLUSIVE"]
    evidenceScore: float = Field(..., ge=0.0, le=1.0, description="Deterministic confidence score based on frame evidence")
    reason: str
    usableFramesProcessed: int
    totalFramesProcessed: int
    matchedDetection: Optional[PotholeDetection] = None
