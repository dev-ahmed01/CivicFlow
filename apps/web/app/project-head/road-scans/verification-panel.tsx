"use client";
import { useEffect, useState } from "react";
import { type PotholeCandidateDetail, type RoadScan } from "@civicos/shared";
import { apiFetch } from "../_lib/api";
import { ScanEvidenceView, VerificationResult } from "./evidence";
import { notifyPortalDataChanged } from "../../_lib/portal-refresh";

export function VerificationPanel({ projectId, state }: { projectId: string; state: string }) {
  const [candidates, setCandidates] = useState<PotholeCandidateDetail[]>([]);
  const [selected, setSelected] = useState("");
  const [scan, setScan] = useState<RoadScan>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  useEffect(() => { void apiFetch<{ candidates: PotholeCandidateDetail[] }>(`/project-head/projects/${projectId}/scan-candidates`).then(result => { setCandidates(result.candidates); setSelected(result.candidates[0]?.id ?? ""); }).catch(() => undefined); }, [projectId]);
  useEffect(() => {
    const latest = candidates.find(item => item.id === selected)?.verifications[0];
    setScan(undefined);
    if (latest) void apiFetch<{ scan: RoadScan }>(`/project-head/road-scans/${latest.id}`).then(result => setScan(result.scan)).catch(() => setError("Previous verification could not be loaded."));
  }, [selected, candidates]);
  async function run() {
    setBusy(true); setError(undefined); setSaved(false);
    try {
      const created = await apiFetch<{ scan: RoadScan }>(`/project-head/pothole-candidates/${selected}/verification`, { method: "POST" }); setScan(created.scan);
      const result = await apiFetch<{ scan: RoadScan }>(`/project-head/road-scans/${created.scan.id}/process`, { method: "POST" }); setScan(result.scan);
    } catch { setError("Verification could not complete. Review recent scans or try again. Engineer evidence can still be reviewed."); }
    finally { setBusy(false); }
  }
  async function review(decision: "CONTINUE_CLOSURE" | "REQUEST_REWORK") {
    setBusy(true); setError(undefined);
    try { await apiFetch(`/project-head/projects/${projectId}/scan-completion-review`, { method: "POST", body: JSON.stringify({ decision, note }) }); setSaved(true); notifyPortalDataChanged(); }
    catch { setError("The decision could not be recorded. Refresh the work and check its current state."); }
    finally { setBusy(false); }
  }
  if (!candidates.length) return null;
  return <section className="scan-verification"><h2>Area Scan · camera-assisted verification</h2><p>Compare the original candidate with a new, request-triggered sample from the same configured camera.</p>
    {candidates.length > 1 ? <label>Candidate<select value={selected} onChange={event => setSelected(event.target.value)}>{candidates.map(item => <option key={item.id} value={item.id}>{item.reference} · {item.camera.name}</option>)}</select></label> : null}
    {state === "AWAITING_VERIFICATION" ? <button className="portal-primary-button" disabled={busy} onClick={() => void run()}>{busy ? "Processing verification…" : "Run Verification Scan"}</button> : <p>Verification becomes available after Engineer completion evidence is submitted.</p>}
    {error ? <p role="alert" className="error">{error}</p> : null}
    {scan?.verification ? <><VerificationResult result={scan.verification.result} />{scan.failureSummary ? <p className="scan-notice">{scan.failureSummary}</p> : null}<div className="scan-comparison"><ScanEvidenceView evidence={scan.verification.before} label="Before repair" />{scan.verification.after ? <ScanEvidenceView evidence={scan.verification.after} label="Verification Scan" /> : <p>Verification image unavailable.</p>}</div>{scan.simulated ? <p className="scan-notice">Demo comparison uses unrelated licensed road photographs as simulated before/after samples. It is not evidence of a real repair.</p> : null}</> : null}
    {state === "AWAITING_VERIFICATION" ? <div className="scan-form"><label>Project Head review note<textarea value={note} onChange={event => setNote(event.target.value)} minLength={5} maxLength={1000} /></label><div className="scan-actions"><button className="portal-primary-button" disabled={busy || saved || note.trim().length < 5} onClick={() => void review("CONTINUE_CLOSURE")}>Approve · continue citizen verification</button><button className="portal-secondary-button" disabled={busy || saved || note.trim().length < 5} onClick={() => void review("REQUEST_REWORK")}>Request rework</button></div>{saved ? <p role="status">Review recorded. The normal workflow remains in effect.</p> : null}</div> : null}
  </section>;
}
