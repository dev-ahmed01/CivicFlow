"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PaginationMeta } from "@civicos/shared";
import { apiFetch } from "./_lib/api";

export default function EngineerDashboardPage() {
  const [mineCount, setMineCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void Promise.all([
      apiFetch<{ pagination: PaginationMeta }>("/projects?scope=mine&limit=1"),
      apiFetch<{ pagination: PaginationMeta }>("/projects?scope=assigned&limit=1"),
    ]).then(([mineResult, assignedResult]) => {
      setMineCount(mineResult.pagination.total);
      setAssignedCount(assignedResult.pagination.total);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load dashboard"));
  }, []);
  return <>
    <header className="portal-heading"><div><p className="eyebrow">Field operations overview</p><h1>Engineer Dashboard</h1><p>Your assigned workload from uptake through citizen-verified completion.</p></div><Link className="primary-link" href="/engineer/projects?view=assigned">Review assigned work</Link></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="metric-grid engineer-metrics">
      <Link className="metric-card green" href="/engineer/projects"><span>Active projects</span><strong>{mineCount}</strong><small>Open project workspace →</small></Link>
      <Link className="metric-card amber" href="/engineer/projects?view=assigned"><span>Awaiting uptake</span><strong>{assignedCount}</strong><small>Review assignments →</small></Link>
    </section>
    <section className="portal-panel engineer-next"><p className="eyebrow">Next actions</p><h2>Keep delivery moving</h2><p>Accept new work, set a timeline, add field notes, and submit completion evidence from each owned project.</p></section>
  </>;
}
