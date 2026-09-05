"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { InspectionDetail } from "@civicos/shared";
import { PageHeader, PortalStatePill } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { EngineerDateStamp, EngineerLoading, EngineerSymbol, EngineerTip } from "../_components/engineer-ui";
import { inspectionAction } from "../_lib/presentation";
import { apiFetch } from "../_lib/api";

type InspectionView = "All" | "Assigned" | "Accepted" | "In Progress" | "Submitted";
const views: InspectionView[] = ["All", "Assigned", "Accepted", "In Progress", "Submitted"];

function inView(item: InspectionDetail, view: InspectionView) {
  if (view === "All") return true;
  if (view === "In Progress") return item.status === "IN_PROGRESS";
  if (view === "Submitted") return ["SUBMITTED", "REVIEWED"].includes(item.status);
  return item.status === view.toUpperCase();
}

export default function EngineerInspectionsPage() {
  const [items, setItems] = useState<InspectionDetail[]>([]);
  const [view, setView] = useState<InspectionView>("All");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const [timeRange, setTimeRange] = useState("all");
  const [page, setPage] = useState(1);
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

  const visible = useMemo(() => items.filter((item) => {
    const haystack = `${item.ticket.title} ${item.ticket.referenceNumber} ${item.ticket.address} ${item.ticket.ward.name}`.toLowerCase();
    const statusMatch = status === "all" || item.status === status;
    const priorityMatch = priority === "all" || item.severity === priority;
    const deadline = new Date(item.deadline).getTime();
    const timeMatch = timeRange === "all" || (timeRange === "overdue" ? deadline < Date.now() : deadline <= Date.now() + 7 * 86400000);
    return inView(item, view) && haystack.includes(query.trim().toLowerCase()) && statusMatch && priorityMatch && timeMatch;
  }), [items, priority, query, status, timeRange, view]);
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const rows = visible.slice((page - 1) * pageSize, page * pageSize);
  const setFilter = <T,>(setter: (value: T) => void, value: T) => { setter(value); setPage(1); };

  return <div className="field-module engineer-inspections">
    <PageHeader eyebrow="Field assessment" title="Inspections" description="Confirm the issue on site, capture structured evidence, and return a recommendation to your Project Head." action={<EngineerDateStamp />} />
    <div className="engineer-work-tabs" role="group" aria-label="Inspection filters">{views.map((item) => <button aria-pressed={view === item} className={view === item ? "active" : ""} key={item} onClick={() => setFilter(setView, item)} type="button">{item}</button>)}</div>
    <section className="engineer-stat-grid engineer-inspection-summary" aria-label="Inspection summary">
      <article className="engineer-stat"><span className="engineer-symbol green"><EngineerSymbol name="clipboard" /></span><div><strong>{items.length}</strong><span>Total inspections</span><small>All time</small></div></article>
      <article className="engineer-stat"><span className="engineer-symbol amber"><EngineerSymbol name="clock" /></span><div><strong>{items.filter((item) => item.status === "ASSIGNED").length}</strong><span>Assigned to you</span><small>Pending acceptance</small></div></article>
      <article className="engineer-stat"><span className="engineer-symbol blue"><EngineerSymbol name="people" /></span><div><strong>{items.filter((item) => item.status === "IN_PROGRESS").length}</strong><span>In progress</span><small>On site verification</small></div></article>
      <article className="engineer-stat"><span className="engineer-symbol submitted"><EngineerSymbol name="check" /></span><div><strong>{items.filter((item) => ["SUBMITTED", "REVIEWED"].includes(item.status)).length}</strong><span>Submitted</span><small>Waiting review</small></div></article>
    </section>
    <section className="engineer-inspection-toolbar" aria-label="Search and filter inspections">
      <label className="engineer-search-field"><EngineerSymbol name="search" /><span className="sr-only">Search inspections</span><input placeholder="Search by location, issue, or ID..." value={query} onChange={(event) => setFilter(setQuery, event.target.value)} /></label>
      <select aria-label="Priority" value={priority} onChange={(event) => setFilter(setPriority, event.target.value)}><option value="all">Priority</option><option value="LOW">Low priority</option><option value="MEDIUM">Medium priority</option><option value="HIGH">High priority</option><option value="CRITICAL">Critical priority</option></select>
      <select aria-label="Status" value={status} onChange={(event) => setFilter(setStatus, event.target.value)}><option value="all">Status</option><option value="ASSIGNED">Assigned</option><option value="ACCEPTED">Accepted</option><option value="IN_PROGRESS">In progress</option><option value="SUBMITTED">Submitted</option><option value="REVIEWED">Reviewed</option></select>
      <select aria-label="Time range" value={timeRange} onChange={(event) => setFilter(setTimeRange, event.target.value)}><option value="all">Any time</option><option value="week">Next 7 days</option><option value="overdue">Overdue</option></select>
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="engineer-inspection-table" aria-label="Assigned inspections" aria-live="polite" aria-busy={loading}>
      <header><span>Inspection</span><span>Location</span><span>Status</span><span>Assigned on</span><span /></header>
      {loading ? <EngineerLoading label="Loading inspections" /> : rows.map((inspection) => {
        const image = inspection.ticket.observations[0]?.imageUrl;
        return <article key={inspection.id}>
          <div className="engineer-inspection-title">{image ? <Image alt="Reported issue" height={64} src={image} unoptimized width={72} /> : <span className="engineer-inspection-placeholder"><EngineerSymbol name="clipboard" /></span>}<span><strong>{inspection.ticket.title}</strong><small>Inspection ID: {inspection.ticket.referenceNumber}</small>{inspection.severity ? <em className={`priority-${inspection.severity.toLowerCase()}`}>{inspection.severity.toLowerCase()} priority</em> : null}</span></div>
          <div className="engineer-inspection-location"><EngineerSymbol name="location" /><span><strong>{inspection.ticket.address}</strong><small>{inspection.ticket.ward.name}</small></span></div>
          <div className="engineer-inspection-status"><PortalStatePill state={inspection.status} /><small>{inspection.status === "ASSIGNED" ? "Pending acceptance" : inspection.status === "IN_PROGRESS" ? "On site verification" : inspection.status === "SUBMITTED" ? "Waiting review" : inspectionAction(inspection.status)}</small></div>
          <time>{new Date(inspection.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}<small>{new Date(inspection.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small></time>
          <Link aria-label={`Open ${inspection.ticket.title}`} href={`/engineer/inspections/${inspection.id}`}>&rarr;</Link>
        </article>;
      })}
      {!loading && rows.length === 0 ? <p className="engineer-empty">No inspections match these filters.</p> : null}
      {!loading && visible.length > 0 ? <footer><span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, visible.length)} of {visible.length} inspections</span><nav aria-label="Inspection pages"><button disabled={page === 1} onClick={() => setPage(page - 1)} type="button">&lsaquo;</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button aria-current={page === number ? "page" : undefined} key={number} onClick={() => setPage(number)} type="button">{number}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)} type="button">&rsaquo;</button></nav></footer> : null}
    </section>
    <EngineerTip>Confirm the reported issue on site and attach clear evidence before submitting your assessment.</EngineerTip>
  </div>;
}
