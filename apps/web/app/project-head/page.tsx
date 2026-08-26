"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { PaginationMeta, ProjectHeadDashboardCounts } from "@civicos/shared";
import { ConflictIndicator } from "../_components/operations";
import { usePortalPolling } from "../_lib/portal-refresh";
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
  const [workflowCounts, setWorkflowCounts] = useState({ readyToCreate: 0, readyToAssign: 0, awaitingVerification: 0 });
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [dashboard, readyToCreate, readyToAssign, awaitingVerification] = await Promise.all([
        apiFetch<DashboardResponse>("/project-head/dashboard"),
        apiFetch<{ pagination: PaginationMeta }>("/tickets?status=INSPECTION_COMPLETE&limit=1"),
        apiFetch<{ pagination: PaginationMeta }>("/projects?status=CREATED&limit=1"),
        apiFetch<{ pagination: PaginationMeta }>("/projects?status=AWAITING_VERIFICATION&limit=1"),
      ]);
      setData(dashboard);
      setWorkflowCounts({
        readyToCreate: readyToCreate.pagination.total,
        readyToAssign: readyToAssign.pagination.total,
        awaitingVerification: awaitingVerification.pagination.total,
      });
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load dashboard");
    }
  }, []);
  usePortalPolling(load);

  const attentionItems = data ? [
    { label: "Ready for inspection", action: "Inspect", value: data.counts.newValidatedTickets + data.counts.inspectionsDue, href: "/project-head/tickets" },
    { label: "Ready to create project", action: "Create Project", value: workflowCounts.readyToCreate, href: "/project-head/projects" },
    { label: "Ready to assign engineer", action: "Assign Engineer", value: workflowCounts.readyToAssign, href: "/project-head/projects" },
    { label: "Pending dependencies", action: "Review Dependency", value: data.counts.dependencyRequestsPending, href: "/project-head/dependencies" },
    { label: "Coordination warnings", action: "Review Coordination", value: data.performance.roadConflicts, href: "/project-head/projects" },
    { label: "Awaiting verification", action: "Track Closure", value: workflowCounts.awaitingVerification, href: "/project-head/projects?status=AWAITING_VERIFICATION" },
  ] : [];

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Operations overview</p><h1>{data?.agency.name ?? "Your agency"}</h1><p>Live workload across validation, inspection, dependencies, and delivery.</p></div><Link className="primary-link" href="/project-head/tickets/new">Create agency ticket</Link></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {!data && !error ? <p className="portal-muted">Loading live counts…</p> : null}
    <section className="attention-zone" aria-labelledby="attention-title">
      <div className="zone-heading"><div><p className="eyebrow">Current workload</p><h2 id="attention-title">Needs your attention</h2></div>{data ? <ConflictIndicator count={data.performance.roadConflicts} href="/project-head/projects" /> : null}</div>
      <div className="attention-grid operations-attention-grid">{attentionItems.map((item) => <Link className={`attention-card ${item.value > 0 ? "actionable" : "receded"}`} href={item.href} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.value > 0 ? `${item.action} →` : "Nothing waiting"}</small></Link>)}</div>
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
  </>;
}
