"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import type { CompletionVerificationDecision, PendingCompletionVerification } from "@civicos/shared";
import { CitizenHeader } from "../_components/citizen-header";
import { Card, PrimaryButton } from "../_components/ui";
import { getCitizenAccessToken } from "../_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
async function citizenFetch<T>(path: string, init?: RequestInit): Promise<T> { const token = getCitizenAccessToken(); const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: "no-store" }); const body = await response.json().catch(() => ({})) as T & { error?: string }; if (!response.ok) throw new Error(body.error ?? "Request failed"); return body; }

export default function CompletionVerificationPage() {
  const [items, setItems] = useState<PendingCompletionVerification[]>([]);
  const [selected, setSelected] = useState<PendingCompletionVerification>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => { try { setItems((await citizenFetch<{ completions: PendingCompletionVerification[] }>("/citizens/me/pending-completion-verifications")).completions); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load completion checks"); } }, []);
  useEffect(() => { void load(); }, [load]);
  const respond = async (decision: CompletionVerificationDecision) => { if (!selected) return; setBusy(true); try { await citizenFetch(`/completion-evidence/${selected.evidenceId}/verify`, { method: "POST", body: JSON.stringify({ decision }) }); setSelected(undefined); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not record response"); } finally { setBusy(false); } };
  return <main><CitizenHeader /><section className="citizen-page"><header className="citizen-page-heading"><p className="eyebrow">Completion verification</p><h1>{selected ? "Does the completed work look right?" : "Work awaiting your check"}</h1><p>Only work connected to reports you previously verified appears here.</p></header>{error ? <p className="error" role="alert">{error}</p> : null}{selected ? <Card><Image alt="Completion evidence" className="completion-evidence" height={600} src={selected.photoUrl} unoptimized width={900} /><h2>{selected.title}</h2><p>{selected.notes}</p><div className="vote-actions"><PrimaryButton disabled={busy} onClick={() => void respond("VERIFIED")} type="button">Verify completion</PrimaryButton><button className="secondary" disabled={busy} onClick={() => void respond("REWORK_REQUESTED")} type="button">Request rework</button><button className="text-back" onClick={() => setSelected(undefined)} type="button">Back to list</button></div></Card> : <div className="cv-ticket-grid">{items.map((item) => <button className="cv-ticket-card" key={item.evidenceId} onClick={() => setSelected(item)} type="button"><span className="cv-ticket-id">Ticket {item.ticketId.slice(0, 8)}</span><h2>{item.title}</h2><small>Submitted {new Date(item.submittedAt).toLocaleDateString("en-IN")}</small></button>)}{items.length === 0 ? <div className="empty-state"><strong>No completed work needs your review.</strong></div> : null}</div>}</section></main>;
}
