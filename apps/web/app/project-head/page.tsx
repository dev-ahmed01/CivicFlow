"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectHeadDashboardCounts } from "@civicos/shared";
import { apiFetch } from "./_lib/api";

type DashboardResponse = { agency: { id: string; name: string }; counts: ProjectHeadDashboardCounts };

export default function ProjectHeadDashboardPage() {
  const [data, setData] = useState<DashboardResponse>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void apiFetch<DashboardResponse>("/project-head/dashboard").then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load dashboard"));
  }, []);

  const cards = data ? [
    { label: "New validated tickets", value: data.counts.newValidatedTickets, href: "/project-head/tickets?status=ROUTED_TO_AGENCY", tone: "green" },
    { label: "Inspections due", value: data.counts.inspectionsDue, href: "/project-head/tickets?status=INSPECTION_DUE", tone: "amber" },
    { label: "Dependency requests pending", value: data.counts.dependencyRequestsPending, href: "/project-head", tone: "blue" },
    { label: "Active projects", value: data.counts.activeProjects, href: "/project-head/projects", tone: "ink" },
  ] : [];

  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">Operations overview</p><h1>{data?.agency.name ?? "Your agency"}</h1><p>Live workload across validation, inspection, dependencies, and delivery.</p></div><Link className="primary-link" href="/project-head/tickets/new">Create agency ticket</Link></header>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!data && !error ? <p className="portal-muted">Loading live counts…</p> : null}
      <section className="metric-grid" aria-label="Agency summary">
        {cards.map((card) => <Link className={`metric-card ${card.tone}`} href={card.href} key={card.label}><span>{card.label}</span><strong>{card.value}</strong><small>View details →</small></Link>)}
      </section>
      <section className="portal-panel quick-actions"><div><p className="eyebrow">Next actions</p><h2>Keep work moving</h2></div><div><Link href="/project-head/tickets">Review validated queue</Link><Link href="/project-head/projects">Track active projects</Link></div></section>
    </>
  );
}
