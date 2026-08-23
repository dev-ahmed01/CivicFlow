"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectListItem } from "@civicos/shared";
import { apiFetch } from "./_lib/api";

export default function EngineerDashboardPage() {
  const [mine, setMine] = useState<ProjectListItem[]>([]);
  const [assigned, setAssigned] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void Promise.all([
      apiFetch<{ projects: ProjectListItem[] }>("/projects?scope=mine"),
      apiFetch<{ projects: ProjectListItem[] }>("/projects?scope=assigned"),
    ]).then(([mineResult, assignedResult]) => { setMine(mineResult.projects); setAssigned(assignedResult.projects); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load dashboard"));
  }, []);
  return <><header className="portal-heading"><div><p className="eyebrow">Field operations overview</p><h1>Engineer Dashboard</h1><p>Your assigned workload from uptake through citizen-verified completion.</p></div><Link className="primary-link" href="/engineer/assigned">Review assigned work</Link></header>{error ? <p className="error" role="alert">{error}</p> : null}<section className="metric-grid engineer-metrics"><Link className="metric-card green" href="/engineer/projects"><span>My ongoing projects</span><strong>{mine.length}</strong><small>Open project list →</small></Link><Link className="metric-card amber" href="/engineer/assigned"><span>Awaiting uptake</span><strong>{assigned.length}</strong><small>Review assignments →</small></Link><Link className="metric-card blue" href="/engineer/geographic"><span>Area coordination</span><strong>List</strong><small>Browse cross-agency work →</small></Link></section><section className="portal-panel engineer-next"><p className="eyebrow">Next actions</p><h2>Keep delivery moving</h2><p>Accept new work, set a timeline, add field notes, and submit completion evidence from each owned project.</p></section></>;
}
