"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { DependencyListItem, PaginationMeta, ProjectListItem } from "@civicos/shared";
import { NextActionButton, ProjectActionCard } from "../_components/operations";
import { usePortalPolling } from "../_lib/portal-refresh";
import { getEngineerNextAction } from "../_lib/workflow-actions";
import { apiFetch, getSession } from "./_lib/api";

export default function EngineerDashboardPage() {
  const [mineCount, setMineCount] = useState(0);
  const [assignedCount, setAssignedCount] = useState(0);
  const [dependencyCount, setDependencyCount] = useState(0);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      const [mineResult, assignedResult, dependencyResult] = await Promise.all([
        apiFetch<{ projects: ProjectListItem[]; pagination: PaginationMeta }>("/projects?scope=mine&limit=50"),
        apiFetch<{ pagination: PaginationMeta }>("/projects?scope=assigned&limit=1"),
        apiFetch<{ dependencies: DependencyListItem[] }>("/dependencies?direction=received&status=ASSIGNED"),
      ]);
      setMineCount(mineResult.pagination.total);
      setAssignedCount(assignedResult.pagination.total);
      setProjects(mineResult.projects);
      const userId = getSession()?.user.id;
      setDependencyCount(dependencyResult.dependencies.filter((item) => item.assignedEngineer?.id === userId).length);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load dashboard");
    }
  }, []);
  usePortalPolling(load);
  const nextProjects = projects
    .filter((project) => !["CLOSED", "CANCELLED"].includes(project.state))
    .sort((first, second) => Number(first.state !== "PENDING_UPTAKE") - Number(second.state !== "PENDING_UPTAKE"))
    .slice(0, 4);

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Field operations overview</p><h1>Engineer Dashboard</h1><p>Your assigned workload from uptake through citizen-verified completion.</p></div><Link className="primary-link" href="/engineer/projects?view=assigned">Review assigned work</Link></header>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="attention-zone engineer-attention" aria-labelledby="engineer-attention-title"><div className="zone-heading"><p className="eyebrow">Current workload</p><h2 id="engineer-attention-title">Needs your attention</h2></div><div className="attention-grid engineer-metrics">
      <Link className={`attention-card ${mineCount > 0 ? "actionable" : "receded"}`} href="/engineer/projects"><span>Active projects</span><strong>{mineCount}</strong><small>{mineCount > 0 ? "Open project workspace →" : "Nothing active"}</small></Link>
      <Link className={`attention-card ${assignedCount > 0 ? "actionable" : "receded"}`} href="/engineer/projects?view=assigned"><span>Awaiting uptake</span><strong>{assignedCount}</strong><small>{assignedCount > 0 ? "Accept projects →" : "Nothing waiting"}</small></Link>
      <Link className={`attention-card ${dependencyCount > 0 ? "actionable" : "receded"}`} href="/engineer/dependencies"><span>Dependency tasks</span><strong>{dependencyCount}</strong><small>{dependencyCount > 0 ? "Open assigned tasks →" : "Nothing assigned"}</small></Link>
    </div></section>
    <section className="operations-section"><div className="zone-heading"><p className="eyebrow">Next actions</p><h2>Keep delivery moving</h2></div><div className="project-action-grid">{nextProjects.map((project) => {
      const action = getEngineerNextAction(project.state);
      const href = `/engineer/projects/${project.id}${action.anchor ? `#${action.anchor}` : ""}`;
      return <ProjectActionCard action={<NextActionButton href={href}>{action.label}</NextActionButton>} key={project.id} project={project}>{action.secondary.map((item) => <Link href={`/engineer/projects/${project.id}#${item.anchor}`} key={item.label}>{item.label}</Link>)}</ProjectActionCard>;
    })}{nextProjects.length === 0 ? <div className="empty-state"><strong>No active work.</strong><span>New assignments will appear here automatically.</span></div> : null}</div></section>
  </>;
}
