"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { InspectionDetail } from "@civicos/shared";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { PortalStatePill } from "../../_components/ui";
import { EngineerHeader, EngineerLoading, EngineerTip, engineerDate } from "../_components/engineer-ui";
import { inspectionFilters, matchesInspectionFilter, isInspectionOpen, inspectionAction, type InspectionFilter } from "../_lib/presentation";
import { apiFetch } from "../_lib/api";

export default function EngineerInspectionsPage() {
  const [items, setItems] = useState<InspectionDetail[]>([]);
  const [filter, setFilter] = useState<InspectionFilter>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    try {
      setItems((await apiFetch<{ inspections: InspectionDetail[] }>("/inspections")).inspections);
      setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load inspections"); }
    finally { setLoading(false); }
  }, []);
  usePortalPolling(load);
  const now = Date.now();
  const visible = items.filter((item) => matchesInspectionFilter(item, filter, now));
  const due = items.filter((item) => isInspectionOpen(item) && new Date(item.deadline).getTime() <= new Date().setHours(23, 59, 59, 999)).length;

  return <div className="field-module engineer-inspections">
    <EngineerHeader eyebrow="Field inspections" title="Inspections" description="Review assigned site inspections and submit field evidence." count={loading ? undefined : due} countLabel="due" />
    <div className="engineer-work-tabs" role="group" aria-label="Inspection filters">{inspectionFilters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">{item}</button>)}</div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="engineer-register" aria-label="Assigned inspections" aria-live="polite" aria-busy={loading}>
      <header className="engineer-register-title"><h2>Site inspections</h2><span>{visible.length} records</span></header>
      {loading ? <EngineerLoading label="Loading inspections" /> : visible.map((inspection) => <article className="engineer-inspection-record" key={inspection.id}>
        <div className="engineer-record-state"><PortalStatePill state={inspection.status} />{matchesInspectionFilter(inspection, "Overdue", now) ? <small className="engineer-overdue">Overdue</small> : null}</div>
        <div className="engineer-record-main"><h2>{inspection.ticket.title}</h2><p>{inspection.ticket.referenceNumber} &middot; {inspection.ticket.category.name}</p><span>{inspection.ticket.address}, {inspection.ticket.ward.name}</span><details className="engineer-row-disclosure"><summary>Assignment details</summary><dl><div><dt>Assigned on</dt><dd>{engineerDate(inspection.createdAt)}</dd></div><div><dt>Assigned by</dt><dd>{inspection.assignedBy.email}</dd></div><div><dt>Assigned engineer</dt><dd>{inspection.assignedEngineer.email}</dd></div></dl></details></div>
        <div className="engineer-row-meta"><small>Deadline</small><strong>{engineerDate(inspection.deadline)}</strong><small>{new Date(inspection.deadline).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small></div>
        <Link className="engineer-action secondary" href={"/engineer/inspections/" + inspection.id}>{inspectionAction(inspection.status)} <span aria-hidden="true">&rsaquo;</span></Link>
      </article>)}
      {!loading && visible.length === 0 ? <p className="engineer-empty">No inspections match this filter. Agency assignments appear here automatically.</p> : null}
    </section>
    <EngineerTip>Confirm the reported issue on site and attach clear evidence before submitting your assessment.</EngineerTip>
  </div>;
}
