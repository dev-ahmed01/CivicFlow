"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { CoordinationConflict, ProjectListItem } from "@civicos/shared";
import { EmptyState, PageHeader, PortalStatePill } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { apiFetch } from "../_lib/api";

type ConflictRow = CoordinationConflict & { projectId: string };

export default function ConflictsPage() {
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [filter, setFilter] = useState<"ALL" | "PROJECT" | "ROAD">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { projects } = await apiFetch<{ projects: ProjectListItem[] }>("/projects?limit=100");
      const results = await Promise.all(projects.map(async (project) => {
        const result = await apiFetch<{ conflicts: CoordinationConflict[] }>(`/projects/${project.id}/coordination-conflicts`);
        return result.conflicts.map((conflict) => ({ ...conflict, projectId: project.id }));
      }));
      const unique = new Map<string, ConflictRow>();
      results.flat().forEach((conflict) => unique.set(`${conflict.kind}:${conflict.id}`, conflict));
      setConflicts([...unique.values()].sort((left, right) => {
        const weight = (value: string) => value.includes("HIGH") || value.includes("PROMINENT") ? 0 : 1;
        return weight(left.severity) - weight(right.severity) || new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime();
      }));
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load advisory conflicts");
    } finally { setLoading(false); }
  }, []);
  usePortalPolling(load);
  const visible = useMemo(() => filter === "ALL" ? conflicts : conflicts.filter((conflict) => conflict.kind === filter), [conflicts, filter]);

  return <>
    <PageHeader eyebrow="Advisory register" title="Conflicts" description="Prioritised spatial and schedule overlaps. Warnings support coordination and never block delivery." />
    <div aria-label="Conflict type" className="portal-tabs" role="tablist">{(["ALL", "ROAD", "PROJECT"] as const).map((item) => <button aria-selected={filter === item} key={item} onClick={() => setFilter(item)} role="tab" type="button">{item === "ALL" ? `All (${conflicts.length})` : item === "ROAD" ? "Road conflicts" : "Schedule & location"}</button>)}</div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading ? <p className="portal-muted" role="status">Checking agency work for advisory overlaps…</p> : null}
    {!loading ? <section className="table-card conflict-register"><div className="table-scroll"><table><thead><tr><th>Priority</th><th>Works involved</th><th>Shared location</th><th>Explainable reason</th><th>Coordination</th><th>Action</th></tr></thead><tbody>{visible.map((conflict) => <tr key={`${conflict.kind}:${conflict.id}`}><td><PortalStatePill state={conflict.severity.includes("HIGH") || conflict.severity.includes("PROMINENT") ? "PRIORITY REVIEW" : "ADVISORY"} /></td><td><strong>{conflict.sourceWork.title}</strong><small>with {conflict.conflictingWork.title} · {conflict.conflictingWork.agency.name}</small></td><td>{conflict.locationDescription}</td><td><strong>{conflict.reason}</strong><small>{conflict.temporalRelationship}</small></td><td>{conflict.coordination ? <PortalStatePill state={conflict.coordination.status} /> : "Not started"}</td><td><Link className="table-action" href={conflict.coordination ? `/project-head/coordination/${conflict.coordination.requestId}` : `/project-head/projects/${conflict.projectId}`}>{conflict.coordination ? "Open request" : "Review & coordinate"}</Link></td></tr>)}</tbody></table></div>{visible.length === 0 ? <EmptyState title="No advisory conflicts in this view" description="New deterministic conflict checks will appear with their rule-based reason." /> : null}</section> : null}
  </>;
}
