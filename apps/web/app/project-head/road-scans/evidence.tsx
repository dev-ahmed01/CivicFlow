"use client";
import Image from "next/image";
import { useState } from "react";
import { type ScanEvidence, type PotholeDetection, type PotholeVerificationResult } from "@civicos/shared";
import { apiUrl } from "../../_lib/api";
export const evidenceUrl = (url: string) => url.startsWith("/road-scan-assets/") ? `${apiUrl}${url}` : url;
export function ScanEvidenceView({ evidence, detection, label }: { evidence: ScanEvidence; detection?: PotholeDetection; label: string }) {
  const [outline, setOutline] = useState(true);
  const [missing, setMissing] = useState(false);
  const detections = detection ? [detection] : evidence.detections;
  return <figure className="scan-evidence"><header><h3>{label}</h3><button type="button" className="portal-secondary-button" aria-pressed={outline} onClick={() => setOutline(value => !value)}>{outline ? "Show original" : "Show AI outline"}</button></header>
    <div className="scan-image" style={{ aspectRatio: `${evidence.image.width}/${evidence.image.height}` }}>
      {missing ? <p role="status">Evidence image unavailable. The recorded observations remain available.</p> : <Image alt={`${label}: road surface`} src={evidenceUrl(evidence.url)} width={evidence.image.width} height={evidence.image.height} unoptimized onError={() => setMissing(true)} />}
      {outline && !missing ? <svg aria-label="Normalized AI outline" viewBox="0 0 1 1" preserveAspectRatio="none">{detections.map(item => <polygon key={item.detectionId} points={item.polygon.map(point => point.join(",")).join(" ")} fill="rgba(242,183,56,.22)" stroke="#ffd05a" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}</svg> : null}
    </div><figcaption><span>{evidence.simulated ? "Simulated camera source · " : ""}{new Date(evidence.capturedAt).toLocaleString("en-IN")}</span><span>{evidence.frameQuality.usable ? "Usable sample" : "Poor-quality sample"}</span><a href={evidence.sourceUrl} target="_blank" rel="noreferrer">{evidence.attribution}</a></figcaption>
  </figure>;
}
export const verificationLabels = { NO_MATCHING_DEFECT_DETECTED: "No matching visible defect detected", DEFECT_STILL_DETECTED: "Matching road defect still visible", INCONCLUSIVE: "Camera evidence inconclusive" } as const;
export function VerificationResult({ result }: { result: PotholeVerificationResult }) {
  return <div className="scan-verdict" data-status={result.verificationStatus} role="status"><h3>{verificationLabels[result.verificationStatus]}</h3><p>{result.usableFramesProcessed} usable / {result.totalFramesProcessed} total frames · Evidence score {Math.round(result.evidenceScore * 100)}%</p><p>Camera-assisted verification is supporting evidence. Final approval remains with the Project Head; citizen verification still applies.</p></div>;
}
