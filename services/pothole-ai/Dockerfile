# Multi-stage Dockerfile for City Connect Pothole AI Service
FROM python:3.10-slim as base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    POTHOLE_AI_MODE=demo

# Install system dependencies required for OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy lock file and install reproducible Python dependencies
COPY requirements.lock.txt requirements.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt

# Create weights, scripts, and fixtures directories
RUN mkdir -p weights scripts fixtures app docs

# Copy application code and scripts
COPY app/ ./app/
COPY fixtures/ ./fixtures/
COPY scripts/ ./scripts/
COPY README.md ./

# Generate synthetic test fixtures on container build
RUN python fixtures/generate_fixtures.py

# Create non-root app user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
