"use client";

import { useCallback, useMemo, useState } from "react";
import type { EngineerSummary, ProjectListItem } from "@civicos/shared";
import { EmptyState, PageHeader, PortalStatePill } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";
import { loadAllAgencyProjects } from "../_lib/paginated-projects";

export default function TeamsPage() {
  const [engineers, setEngineers] = useState<EngineerSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [team, work] = await Promise.all([
        apiFetch<{ engineers: EngineerSummary[] }>("/project-head/engineers"),
        loadAllAgencyProjects(),
      ]);
      setEngineers(team.engineers); setProjects(work); setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the agency team"); }
  }, []);
  usePortalPolling(load);
  const workload = useMemo(() => new Map(engineers.map((engineer) => [engineer.id, projects.filter((project) => project.engineerId === engineer.id)])), [engineers, projects]);
  const visibleEngineers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? engineers.filter((engineer) => engineer.email?.toLowerCase().includes(query)) : engineers;
  }, [engineers, search]);
  const capacity = useMemo(() => engineers.reduce((summary, engineer) => {
    const assigned = workload.get(engineer.id) ?? [];
    const active = assigned.filter((project) => ["UPTAKEN", "ACTIVE", "MODIFIED"].includes(project.state)).length;
    if (active >= 5) summary.atCapacity += 1;
    else summary.available += 1;
    return summary;
  }, { available: 0, atCapacity: 0 }), [engineers, workload]);

  return <>
    <PageHeader title="Team" description="Engineer capacity, current civic work, pending assignments, and next deadlines." />
    {error ? <p className="error" role="alert">{error}</p> : null}
    <p className="ph-team-summary">{engineers.length} engineer{engineers.length === 1 ? "" : "s"} · {capacity.available} available · {capacity.atCapacity} at capacity</p>
    <section className="ph-work-toolbar ph-team-toolbar"><label><span>Search engineers</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></label></section>
    <section className="ph-work-register"><div className="table-scroll"><table><thead><tr><th>Engineer</th><th>Active works</th><th>Pending assignments</th><th>Next deadline</th><th>Workload / availability</th></tr></thead><tbody>{visibleEngineers.map((engineer) => {
      const assigned = workload.get(engineer.id) ?? [];
      const active = assigned.filter((project) => ["UPTAKEN", "ACTIVE", "MODIFIED"].includes(project.state));
      const pending = assigned.filter((project) => project.state === "PENDING_UPTAKE");
      const due = assigned.filter((project) => project.plannedEnd).sort((left, right) => new Date(left.plannedEnd!).getTime() - new Date(right.plannedEnd!).getTime())[0];
      return <tr key={engineer.id}><td><strong>{engineer.email ?? "Email unavailable"}</strong></td><td>{active.length}</td><td>{pending.length}</td><td>{due?.plannedEnd ? new Date(due.plannedEnd).toLocaleDateString("en-IN") : "No scheduled work"}</td><td><PortalStatePill state={active.length >= 5 ? "HIGH WORKLOAD" : pending.length ? "ASSIGNMENTS PENDING" : "AVAILABLE"} /></td></tr>;
    })}</tbody></table></div>{visibleEngineers.length === 0 ? <EmptyState title={engineers.length ? "No engineers match this search" : "No engineers in this agency"} description={engineers.length ? "Try another name or email." : "Administrators manage staff accounts and agency membership."} /> : null}</section>
  </>;
}
