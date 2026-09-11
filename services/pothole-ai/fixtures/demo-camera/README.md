# Simulated Camera Network - Demo Fixtures

This directory structure defines the simulated road camera assets for interactive SIH hackathon demonstrations.

## Disclaimer & Privacy Notice

> [!IMPORTANT]
> **Simulated Assets Only**: These camera sources represent a controlled, simulated camera network. The microservice DOES NOT ingest continuous live municipal CCTV streams or execute surveillance watchers.

## Camera Scenarios

- `CAM-01`: Single pothole detection scenario.
- `CAM-02`: Multiple potholes across lane boundaries.
- `CAM-03`: Clear asphalt road surface (negative detection control).
- `CAM-04`: Pre-repair baseline vs post-repair verification pair.
- `CAM-05`: Poor lighting / heavy blur inconclusive scenario.

## Manifest Structure

Refer to `manifest.json` for camera ID mapping, frame image paths, expected detection counts, and asset licenses.
