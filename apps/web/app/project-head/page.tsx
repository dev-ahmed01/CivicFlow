"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectHeadDashboardCounts } from "@civicos/shared";
import { apiFetch } from "./_lib/api";

type DashboardResponse = {
  agency: { id: string; name: string };
  counts: ProjectHeadDashboardCounts;
  performance: {
    ticketsResolved: number;
    resolutionRatePercent: number;
    averageInspectionHours: number | null;
    dependencyEscalationRatePercent: number;
    reworkRatePercent: number;
    roadConflicts: number;
    simulatedRestorationCostSaved: { amountInr: number; label: "Simulated/Illustrative" };
  };
};

export default function ProjectHeadDashboardPage() {
  const [data, setData] = useState<DashboardResponse>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void apiFetch<DashboardResponse>("/project-head/dashboard").then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load dashboard"));
  }, []);

  const attentionItems = data ? [
    { label: "New validated tickets", value: data.counts.newValidatedTickets, href: "/project-head/tickets?status=ROUTED_TO_AGENCY" },
    { label: "Inspections due", value: data.counts.inspectionsDue, href: "/project-head/tickets?status=INSPECTION_DUE" },
    { label: "Dependency requests pending", value: data.counts.dependencyRequestsPending, href: "/project-head/dependencies" },
  ] : [];

  return (
    <>
      <header className="portal-heading"><div><p className="eyebrow">Operations overview</p><h1>{data?.agency.name ?? "Your agency"}</h1><p>Live workload across validation, inspection, dependencies, and delivery.</p></div><Link className="primary-link" href="/project-head/tickets/new">Create agency ticket</Link></header>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {!data && !error ? <p className="portal-muted">Loading live counts…</p> : null}
      <section className="attention-zone" aria-labelledby="attention-title">
        <div className="zone-heading"><p className="eyebrow">Current workload</p><h2 id="attention-title">Needs your attention</h2></div>
        <div className="attention-grid">
          {attentionItems.map((item) => <Link className={`attention-card ${item.value > 0 ? "actionable" : "receded"}`} href={item.href} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.value > 0 ? "Review now →" : "Nothing waiting"}</small></Link>)}
        </div>
      </section>
      {data ? <section className="portal-panel analytics-summary delivery-performance" aria-labelledby="agency-performance-title">
        <div><p className="eyebrow">Delivery performance</p><h2 id="agency-performance-title">Agency delivery indicators</h2><p>Lagging indicators from completed and in-progress work.</p></div>
        <div className="analytics-mini-grid">
          <div><span>Resolved</span><strong>{data.performance.ticketsResolved}</strong><small>{data.performance.resolutionRatePercent}% of created tickets</small></div>
          <div><span>Avg. inspection time</span><strong>{data.performance.averageInspectionHours ?? "—"}</strong><small>hours from ticket creation</small></div>
          <div><span>Dependency escalation</span><strong>{data.performance.dependencyEscalationRatePercent}%</strong><small>of dependency requests</small></div>
          <div><span>Citizen “not resolved”</span><strong>{data.performance.reworkRatePercent}%</strong><small>completion responses</small></div>
          <div><span>Road conflicts</span><strong>{data.performance.roadConflicts}</strong><small>recorded advisory detections</small></div>
          <div className="simulated-metric"><span>Restoration cost saved</span><strong>₹{data.performance.simulatedRestorationCostSaved.amountInr.toLocaleString("en-IN")}</strong><small>{data.performance.simulatedRestorationCostSaved.label}</small></div>
        </div>
      </section> : null}
      <section className="portal-panel quick-actions"><div><p className="eyebrow">Next actions</p><h2>Keep work moving</h2></div><div><Link href="/project-head/tickets">Review validated queue</Link><Link href="/project-head/projects">Track active projects</Link></div></section>
    </>
  );
}
