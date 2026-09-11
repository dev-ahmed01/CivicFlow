"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { type RoadScan, type RoadScanSummary, type RoadScanOptions, type PotholeCandidateDetail, type EngineerCapacitySummary, type ProjectListItem } from "@civicos/shared";
import { apiFetch } from "../_lib/api";
import { PageHeader } from "../../_components/ui";
import { DetailDrawer, DrawerSection, StatusSummary } from "../../_components/operational-ui";
import { ScanEvidenceView, VerificationResult } from "./evidence";
const CoverageMap = dynamic(() => import("../work-calendar/work-map").then(module => module.ScanCoverageMap), { ssr: false, loading: () => <p>Loading camera map…</p> });
const labels: Record<string, string> = { QUEUED: "Ready to process", RUNNING: "Processing cameras", COMPLETED: "Completed", PARTIAL: "Partially completed", FAILED: "Unable to complete", NEW: "Needs review", INSPECTION_ASSIGNED: "Inspection assigned", LINKED: "Linked to work", DISMISSED: "Dismissed", PENDING: "Waiting", USABLE: "Usable", POOR_QUALITY: "Poor quality", UNAVAILABLE: "Unavailable", LOW: "Small", MEDIUM: "Moderate", HIGH: "Large" };
const message = (error: unknown) => error instanceof Error && !/https?:|Express|Python|API is unreachable/.test(error.message) ? error.message : "The scan request could not be completed. Please try again.";
function ScanSummary({ scan }: { scan: RoadScan }) {
  return <><div className="scan-summary"><StatusSummary items={[{ label: "Cameras available", value: scan.camerasRequested }, { label: "Successfully sampled", value: scan.usableCameras }, { label: "Poor quality / unavailable", value: scan.unusableCameras }, { label: "Raw detections", value: scan.rawDetections }, { label: "Unique candidates", value: scan.uniqueCandidates }, { label: "Linked to work", value: scan.candidates.filter(item => item.projectId).length }]} /></div>{scan.failureSummary ? <p className="scan-notice">{scan.failureSummary}</p> : null}</>;
}
export default function AreaScanPage() {
  const [options, setOptions] = useState<RoadScanOptions>();
  const [wardId, setWardId] = useState("");
  const [recent, setRecent] = useState<RoadScanSummary[]>([]);
  const [scan, setScan] = useState<RoadScan>();
  const [candidate, setCandidate] = useState<PotholeCandidateDetail>();
  const [engineers, setEngineers] = useState<EngineerCapacitySummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [engineerId, setEngineerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [reason, setReason] = useState("");
  const [deadline, setDeadline] = useState(() => new Date(Date.now() + 172800000).toISOString().slice(0, 10));
  const [action, setAction] = useState<"assign" | "dismiss" | "link">("assign");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    const [next, history] = await Promise.all([apiFetch<RoadScanOptions>("/project-head/road-scans/options"), apiFetch<{ scans: RoadScanSummary[] }>("/project-head/road-scans/recent")]);
    setOptions(next); setWardId(current => current || next.wards[0]?.id || ""); setRecent(history.scans);
  }, []);
  const openScan = useCallback(async (id: string) => { const result = await apiFetch<{ scan: RoadScan }>(`/project-head/road-scans/${id}`); setScan(result.scan); }, []);
  useEffect(() => { void refresh().catch(error => setError(message(error))); const initial = new URLSearchParams(window.location.search).get("scan"); if (initial) void openScan(initial).catch(error => setError(message(error))); }, [refresh, openScan]);
  useEffect(() => {
    if (!scan || !["QUEUED", "RUNNING"].includes(scan.status)) return;
    const timer = setInterval(() => { void openScan(scan.id).catch(error => setError(message(error))); }, 1200);
    return () => clearInterval(timer);
  }, [scan, openScan]);
  async function process(id: string) { const result = await apiFetch<{ scan: RoadScan }>(`/project-head/road-scans/${id}/process`, { method: "POST" }); setScan(result.scan); await refresh(); }
  async function start() {
    setBusy(true); setError(undefined);
    try { const result = await apiFetch<{ scan: RoadScan }>("/project-head/road-scans", { method: "POST", body: JSON.stringify({ type: "AREA", wardId }) }); setScan(result.scan); await process(result.scan.id); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  async function openCandidate(id: string) {
    setError(undefined); setAction("assign"); setReason(""); setEngineerId(""); setProjectId("");
    try {
      const [result, roster, work] = await Promise.all([apiFetch<{ candidate: PotholeCandidateDetail }>(`/project-head/pothole-candidates/${id}`), apiFetch<{ engineers: EngineerCapacitySummary[] }>("/project-head/engineers"), apiFetch<{ projects: ProjectListItem[] }>("/projects?page=1&limit=100")]);
      setCandidate(result.candidate); setEngineers(roster.engineers); setProjects(work.projects);
    } catch (error) { setError(message(error)); }
  }
  async function submitCandidate() {
    if (!candidate) return;
    setBusy(true); setError(undefined);
    try {
      const endpoint = action === "assign" ? "assign-inspection" : action;
      const body = action === "assign" ? { engineerId, deadline: new Date(`${deadline}T17:00:00+05:30`).toISOString() } : action === "link" ? { projectId, reason } : { reason };
      await apiFetch(`/project-head/pothole-candidates/${candidate.id}/${endpoint}`, { method: "POST", body: JSON.stringify(body) });
      await openCandidate(candidate.id); if (scan) await openScan(scan.id); await refresh();
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  const running = scan && ["QUEUED", "RUNNING"].includes(scan.status);
  return <div className="scan-page"><Link className="back-link" href="/project-head">← Back to Today</Link><PageHeader title="Area Scan" description="Analyze available road-facing camera samples for visible pothole candidates. Only configured camera coverage is scanned." />
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="ph-surface scan-setup"><div><h2>{options?.simulated ? "Demo camera network" : "Configured camera network"}</h2><p>{options?.providerMode === "AI" ? "Real model analysis of configured samples" : "Deterministic demo replay"} · Started only on your request.</p></div><label>Ward<select value={wardId} disabled={busy || (options?.wards.length ?? 0) < 2} onChange={event => setWardId(event.target.value)}>{options?.wards.map(ward => <option key={ward.id} value={ward.id}>{ward.name} · {ward.camerasAvailable} cameras</option>)}</select></label><button className="portal-primary-button" disabled={busy || Boolean(running) || !wardId} onClick={() => void start()} type="button">{busy ? "Processing samples…" : "Start Area Scan"}</button>{options && !options.wards.length ? <p>No cameras are configured for your authorized wards.</p> : null}</section>
    {scan ? <section className="ph-surface scan-results"><header><div><h2>{scan.type === "AREA" ? "Pothole candidates visible within scanned camera coverage" : "Verification Scan"}</h2><p>{scan.ward.name} · {labels[scan.status]} · {new Date(scan.createdAt).toLocaleString("en-IN")}</p></div></header>
      <p role="status">{scan.camerasProcessed} / {scan.camerasRequested} cameras processed</p>{scan.status === "QUEUED" && !busy ? <button className="portal-primary-button" onClick={() => { setBusy(true); void process(scan.id).catch(error => setError(message(error))).finally(() => setBusy(false)); }}>Process queued scan</button> : null}<ScanSummary scan={scan} />
      <details><summary>Camera sample status</summary><div className="scan-camera-list">{scan.cameras.map(item => <div key={item.camera.id}><strong>{item.camera.code} · {item.camera.name}</strong><span>{labels[item.status]} · {item.framesProcessed} frames</span>{item.failure ? <small>{item.failure}</small> : null}</div>)}</div></details>
      {scan.verification ? <><VerificationResult result={scan.verification.result} /><div className="scan-comparison"><ScanEvidenceView label="Before repair" evidence={scan.verification.before} />{scan.verification.after ? <ScanEvidenceView label="Verification Scan" evidence={scan.verification.after} /> : <p>No usable verification image was recorded.</p>}</div><Link href={`/project-head/projects/${scan.verification.projectId}`}>Open completion review →</Link></> : scan.candidates.length ? <div className="scan-result-grid"><CoverageMap candidates={scan.candidates} onSelect={id => void openCandidate(id)} /><div className="scan-candidate-list">{scan.candidates.map(item => <button className="scan-candidate-card" key={item.id} onClick={() => void openCandidate(item.id)}><span><code>{item.reference}</code><small>{labels[item.status]}</small></span><strong>{item.camera.name}</strong><span>{item.camera.code} · {Math.round(item.detection.confidence * 100)}% AI confidence</span><span>{item.uniqueFrameCount} observed frames · {labels[item.detection.visualExtentCandidate]} visual extent</span><small>{new Date(item.firstSeenAt).toLocaleString("en-IN")}{item.projectId ? " · Linked to work" : ""}</small><b>Review candidate →</b></button>)}</div></div> : !running ? <p className="scan-empty">{scan.usableCameras ? "No repeated pothole candidates were detected in the usable camera coverage." : "No usable camera evidence. Review the camera statuses and try again."}</p> : null}
    </section> : null}
    <section className="ph-surface scan-history"><h2>Recent scans</h2>{recent.length ? recent.map(item => <button key={item.id} onClick={() => void openScan(item.id).catch(error => setError(message(error)))}><span><strong>{item.type === "AREA" ? "Area Scan" : "Verification Scan"}</strong> · {item.ward.name}<small>{new Date(item.createdAt).toLocaleString("en-IN")}</small></span><span>{labels[item.status]} · {item.camerasProcessed}/{item.camerasRequested} cameras · {item.uniqueCandidates} candidates →</span></button>) : <p>No scans recorded yet.</p>}</section>
    <DetailDrawer open={Boolean(candidate)} title={candidate?.camera.name ?? "Candidate"} reference={candidate?.reference ?? "Area Scan"} status={candidate ? labels[candidate.status] : undefined} onClose={() => setCandidate(undefined)}>
      {candidate ? <>{error ? <p role="alert" className="error">{error}</p> : null}<ScanEvidenceView key={candidate.id} label="Candidate evidence" evidence={candidate.evidence} detection={candidate.detection} /><StatusSummary items={[{ label: "AI confidence", value: `${Math.round(candidate.detection.confidence * 100)}%` }, { label: "Observed frames", value: candidate.uniqueFrameCount }, { label: "Visual extent", value: labels[candidate.detection.visualExtentCandidate] }, { label: "Camera", value: candidate.camera.code }]} /><p>Visual extent describes visible image area. Engineering severity is determined by the site inspection.</p>
      {candidate.status === "NEW" ? <DrawerSection title="Review decision"><div className="scan-actions">{(["assign", "link", "dismiss"] as const).map(value => <button className="portal-secondary-button" aria-pressed={action === value} key={value} onClick={() => setAction(value)}>{value === "assign" ? "Assign inspection" : value === "link" ? "Link to work" : "Dismiss"}</button>)}</div><div className="scan-form">
        {action === "assign" ? <><label>Engineer<select value={engineerId} onChange={event => setEngineerId(event.target.value)}><option value="">Choose an Engineer</option>{engineers.map(engineer => <option key={engineer.id} value={engineer.id}>{engineer.displayName ?? engineer.email}</option>)}</select></label><label>Inspection deadline<input type="date" value={deadline} min={new Date().toISOString().slice(0, 10)} onChange={event => setDeadline(event.target.value)} /></label></> : <>{action === "link" ? <label>Existing open work<select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">Choose work in this ward</option>{projects.filter(project => !["CLOSED", "CANCELLED"].includes(project.state)).map(project => <option key={project.id} value={project.id}>{project.referenceNumber} · {project.title}</option>)}</select></label> : null}<label>Reason<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={5} maxLength={1000} /></label></>}
        <button className="portal-primary-button" disabled={busy || (action === "assign" ? !engineerId || !deadline : reason.trim().length < 5 || (action === "link" && !projectId))} onClick={() => void submitCandidate()}>{busy ? "Saving…" : action === "assign" ? "Confirm inspection assignment" : action === "link" ? "Confirm link" : "Dismiss candidate"}</button></div></DrawerSection> : <DrawerSection title="Next step">{candidate.ticketId ? <Link href={`/project-head/tickets/${candidate.ticketId}`}>Open inspection and issue review →</Link> : null}{candidate.projectId ? <p><Link href={`/project-head/projects/${candidate.projectId}`}>Open linked civic work →</Link></p> : null}{candidate.dismissReason ? <p>{candidate.dismissReason}</p> : null}</DrawerSection>}
      <details><summary>Observations and model provenance</summary><p>{candidate.evidence.model.name} · {candidate.evidence.model.runtimeMode}</p><p className="scan-sha">{candidate.evidence.model.weightsSha256 ?? "Simulated replay; no inference model SHA"}</p>{candidate.observations.map(item => <p key={item.id}>Frame {item.frameIndex + 1} · {new Date(item.evidence.capturedAt).toLocaleString("en-IN")} · {Math.round(item.detection.confidence * 100)}% confidence</p>)}</details></> : null}
    </DetailDrawer>
  </div>;
}

