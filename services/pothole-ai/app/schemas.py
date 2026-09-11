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
    visualSeverityCandidate: Literal["LOW", "MEDIUM", "HIGH"] = Field(
        ...,
        description="Demo heuristic based on image mask size; requires field engineering verification"
    )

class ModelMetadata(BaseModel):
    name: str = Field(..., description="Name of AI model")
    version: str = Field(..., description="Model version")
    threshold: float = Field(..., description="Confidence threshold used for filtering")

class DetectionResponse(BaseModel):
    requestId: Optional[str] = Field(default=None, description="Optional request tracking identifier")
    cameraId: Optional[str] = Field(default=None, description="Optional camera identifier")
    capturedAt: Optional[str] = Field(default=None, description="Optional capture ISO timestamp")
    image: ImageDimensions = Field(..., description="Image resolution metadata")
    detections: List[PotholeDetection] = Field(..., description="List of detected potholes")
    model: ModelMetadata = Field(..., description="Model runtime metadata")
    processingMs: int = Field(..., ge=0, description="Inference processing duration in milliseconds")

class HealthResponse(BaseModel):
    status: str = Field(default="ok")
    modelLoaded: bool = Field(...)
    modelName: str = Field(...)
    version: str = Field(...)
    device: str = Field(...)

# Temporal Confirmation Schemas
class FrameDetectionInput(BaseModel):
    frameIndex: int
    timestampSec: float
    detections: List[PotholeDetection]

class TemporalDefectCluster(BaseModel):
    clusterId: str
    repeatCount: int
    firstFrameIndex: int
    lastFrameIndex: int
    firstTimestampSec: float
    lastTimestampSec: float
    averageConfidence: float
    canonicalBbox: NormalizedBBox
    canonicalPolygon: List[Tuple[float, float]]
    maxVisibleAreaRatio: float
    visualSeverityCandidate: Literal["LOW", "MEDIUM", "HIGH"]

class TemporalConfirmationResponse(BaseModel):
    totalFramesProcessed: int
    totalRawDetections: int
    confirmedClusters: List[TemporalDefectCluster]

# Verification Scan Schemas
class VerificationScanRequest(BaseModel):
    baselineDetection: PotholeDetection
    currentDetections: List[PotholeDetection]
    iouThreshold: float = Field(default=0.30)
    qualityOK: bool = Field(default=True)

class VerificationScanResponse(BaseModel):
    verificationStatus: Literal["DEFECT_STILL_DETECTED", "NO_MATCHING_DEFECT_DETECTED", "INCONCLUSIVE"]
    confidence: float
    reason: str
    matchedDetection: Optional[PotholeDetection] = None
