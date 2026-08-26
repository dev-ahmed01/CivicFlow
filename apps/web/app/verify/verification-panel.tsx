"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { PendingValidation, SubmitValidationResult, ValidationVote } from "@civicos/shared";
import { citizenApiFetch as apiFetch } from "../_lib/citizen-auth";

const actions: Array<{ vote: ValidationVote; label: string; className: string }> = [
  { vote: "CONFIRM", label: "Confirm this exists", className: "vote-confirm" },
  { vote: "NOT_SURE", label: "Not sure", className: "vote-neutral" },
  { vote: "REJECT", label: "Doesn’t look right", className: "vote-reject" },
];

export function VerificationPanel() {
  const [validations, setValidations] = useState<PendingValidation[]>([]);
  const [selected, setSelected] = useState<PendingValidation>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void apiFetch<{ validations: PendingValidation[] }>("/citizens/me/pending-validations")
      .then((body) => setValidations(body.validations))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load nearby requests"))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (vote: ValidationVote) => {
    if (!selected) return;
    setSubmitting(true); setError(undefined);
    try {
      const result = await apiFetch<SubmitValidationResult>(`/tickets/${selected.ticketId}/validate`, { method: "POST", body: JSON.stringify({ vote }) });
      setValidations((current) => current.filter((item) => item.ticketId !== selected.ticketId));
      setMessage(result.alreadyResolved ? "This request was already resolved. Your response was still recorded." : "Thanks — your response has been recorded.");
      setSelected(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not record your response"); }
    finally { setSubmitting(false); }
  };

  if (selected) {
    return <section className="verification-shell"><button className="text-back" type="button" onClick={() => setSelected(undefined)}>‹ Back to requests</button><div className="verification-layout"><div className="verification-image"><Image src={selected.imageUrl} alt={`Photo for ${selected.title}`} fill priority sizes="(max-width: 800px) 100vw, 60vw" unoptimized /></div><div className="verification-card"><p className="eyebrow">Nearby verification request</p><h1>Can you confirm this?</h1><span className="status-pill">{selected.category.name}</span><h2>{selected.title}</h2><p className="distance">{Math.round(selected.distanceMeters)} m from your last known location</p><p className="help">Choose what best matches what you can verify. Other people’s responses are hidden until after you answer.</p><div className="vote-actions">{actions.map((action) => <button className={action.className} disabled={submitting} key={action.vote} type="button" onClick={() => void submit(action.vote)}>{action.label}</button>)}</div>{error ? <p className="error" role="alert">{error}</p> : null}</div></div></section>;
  }

  return <section className="verification-shell"><div className="verification-heading"><p className="eyebrow">Community verification</p><h1>Issues near you</h1><p>One quick check helps nearby civic reports move forward.</p></div>{message ? <p className="verification-success" role="status">{message}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}{loading ? <p className="help">Loading nearby requests…</p> : null}{!loading && validations.length === 0 ? <div className="empty-card"><h2>You’re all caught up</h2><p>No nearby requests need your help right now.</p></div> : <div className="request-grid">{validations.map((validation) => <button className="request-card" key={validation.ticketId} type="button" onClick={() => { setMessage(undefined); setSelected(validation); }}><span className="eyebrow">{validation.category.name}</span><strong>{validation.title}</strong><span>{Math.round(validation.distanceMeters)} m away</span></button>)}</div>}</section>;
}
