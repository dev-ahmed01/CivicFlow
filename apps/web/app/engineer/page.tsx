"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DependencyListItem, PaginationMeta } from "@civicos/shared";
import { apiFetch, getSession } from "./_lib/api";

export default function EngineerDashboardPage() {
  const [mineCount, setMineCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [dependencyCount, setDependencyCount] = useState(0);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void Promise.all([
      apiFetch<{ pagination: PaginationMeta }>("/projects?scope=mine&limit=1"),
      apiFetch<{ pagination: PaginationMeta }>("/projects?scope=assigned&limit=1"),
      apiFetch<{ dependencies: DependencyListItem[] }>("/dependencies?direction=received&status=ASSIGNED"),
    ]).then(([mineResult, assignedResult, dependencyResult]) => {
      setMineCount(mineResult.pagination.total);
      setAssignedCount(assignedResult.pagination.total);
      const userId = getSession()?.user.id;
      setDependencyCount(dependencyResult.dependencies.filter((item) => item.assignedEngineer?.id === userId).length);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load dashboard"));
  }, []);
  return <>
    <header className="portal-heading"><div><p className="eyebrow">Field operations overview</p><h1>Engineer Dashboard</h1><p>Your assigned workload from uptake through citizen-verified completion.</p></div><Link className="primary-link" href="/engineer/projects?view=assigned">Review assigned work</Link></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="attention-zone engineer-attention" aria-labelledby="engineer-attention-title">
      <div className="zone-heading"><p className="eyebrow">Current workload</p><h2 id="engineer-attention-title">Needs your attention</h2></div>
      <div className="attention-grid engineer-metrics">
        <Link className={`attention-card ${mineCount > 0 ? "actionable" : "receded"}`} href="/engineer/projects"><span>Active projects</span><strong>{mineCount}</strong><small>{mineCount > 0 ? "Open project workspace →" : "Nothing active"}</small></Link>
        <Link className={`attention-card ${assignedCount > 0 ? "actionable" : "receded"}`} href="/engineer/projects?view=assigned"><span>Awaiting uptake</span><strong>{assignedCount}</strong><small>{assignedCount > 0 ? "Review assignments →" : "Nothing waiting"}</small></Link>
        <Link className={`attention-card ${dependencyCount > 0 ? "actionable" : "receded"}`} href="/engineer/dependencies"><span>Dependency tasks</span><strong>{dependencyCount}</strong><small>{dependencyCount > 0 ? "Open assigned tasks →" : "Nothing assigned"}</small></Link>
      </div>
    </section>
    <section className="portal-panel engineer-next"><p className="eyebrow">Next actions</p><h2>Keep delivery moving</h2><p>Accept new work, set a timeline, add field notes, and submit completion evidence from each owned project.</p></section>
  </>;
}
