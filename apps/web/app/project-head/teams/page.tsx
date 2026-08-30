"use client";

import { useCallback, useMemo, useState } from "react";
import type { EngineerSummary, ProjectListItem } from "@civicos/shared";
import { EmptyState, PageHeader, PortalStatePill } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";

export default function TeamsPage() {
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [team, work] = await Promise.all([
        apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers"),
        apiFetch<{ projects: ProjectListItem[] }>("/projects?limit=100"),
      ]);
      setEngineers(team.engineers); setProjects(work.projects); setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the agency team"); }
  }, []);
  usePortalPolling(load);
  const workload = useMemo(() => new Map(engineers.map((engineer) => [engineer.id, projects.filter((project) => project.engineerId === engineer.id)])), [engineers, projects]);

  return <>
    <PageHeader eyebrow="Agency capacity" title="Teams" description="Engineer assignments and current workload. Assignment changes remain within each work record." />
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="table-card"><div className="table-scroll"><table><thead><tr><th>Engineer</th><th>Active works</th><th>Awaiting uptake</th><th>Due next</th><th>Availability</th></tr></thead><tbody>{engineers.map((engineer) => {
      const assigned = workload.get(engineer.id) ?? [];
      const active = assigned.filter((project) => ["UPTAKEN", "ACTIVE", "MODIFIED"].includes(project.state));
      const pending = assigned.filter((project) => project.state === "PENDING_UPTAKE");
      const due = assigned.filter((project) => project.plannedEnd).sort((left, right) => new Date(left.plannedEnd!).getTime() - new Date(right.plannedEnd!).getTime())[0];
      return <tr key={engineer.id}><td><strong>{engineer.email ?? "Email unavailable"}</strong></td><td>{active.length}</td><td>{pending.length}</td><td>{due?.plannedEnd ? new Date(due.plannedEnd).toLocaleDateString("en-IN") : "No scheduled work"}</td><td><PortalStatePill state={active.length >= 5 ? "HIGH WORKLOAD" : pending.length ? "ASSIGNMENTS PENDING" : "AVAILABLE"} /></td></tr>;
    })}</tbody></table></div>{engineers.length === 0 ? <EmptyState title="No engineers in this agency" description="Administrators manage staff accounts and agency membership." /> : null}</section>
  </>;
}
