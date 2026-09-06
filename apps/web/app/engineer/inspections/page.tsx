"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { InspectionDetail } from "@civicos/shared";
import { PageHeader, PortalStatePill } from "../../_components/ui";
import { usePortalPolling } from "../../_lib/portal-refresh";
import { EngineerDateStamp, EngineerLoading, EngineerStatCard, EngineerSymbol } from "../_components/engineer-ui";
import { inspectionAction } from "../_lib/presentation";
import { apiFetch } from "../_lib/api";

import { queryPage, useEngineerQuery } from "../_lib/navigation";

type InspectionView = "All" | "Assigned" | "Accepted" | "In Progress" | "Submitted";
const views: InspectionView[] = ["Assigned", "Accepted", "In Progress", "Submitted"];
const stateKey = (view: string) => view.toLowerCase().replaceAll(" ", "_");

function inView(item: InspectionDetail, view: InspectionView) {
  if (view === "All") return true;
  if (view === "In Progress") return item.status === "IN_PROGRESS";
  if (view === "Submitted") return ["SUBMITTED", "REVIEWED"].includes(item.status);
  return item.status === view.toUpperCase();
}

export default function EngineerInspectionsPage() {
  const [items, setItems] = useState<InspectionDetail[]>([]);
  const { params, update } = useEngineerQuery();
  const view = views.find((item) => stateKey(item) === params.get("state")) ?? "All";
  const requestedPage = queryPage(params.get("page"));
  const setPage = (page: number) => update({ page: String(page) });
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

  const visible = items.filter((item) => inView(item, view));
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = visible.slice((page - 1) * pageSize, page * pageSize);
  return <div className="field-module engineer-inspections">
    <PageHeader eyebrow="Field assessment" title="Inspections" description="Confirm the issue on site, capture structured evidence, and return a recommendation to your Project Head." action={<EngineerDateStamp />} />
    <section className="engineer-stat-grid engineer-inspection-summary" aria-label="Inspection lifecycle">
      {views.map((item, index) => <EngineerStatCard key={item} label={item} count={loading ? undefined : items.filter((inspection) => inView(inspection, item)).length} note={["Waiting for acceptance", "Ready to start", "On site assessment", "Submitted or reviewed"][index]!} icon={["clipboard", "check", "location", "check"][index]!} tone={["amber", "blue", "green", "green"][index]!} selected={view === item} onClick={() => update({ state: view === item ? undefined : stateKey(item), page: undefined })} />)}
    </section>
    <div className="engineer-list-heading"><h2>{view === "All" ? "Inspections" : view + " inspections"}</h2><span>{loading ? "Loading..." : items.length + " total"}</span>{view !== "All" ? <button type="button" className="engineer-text-button" onClick={() => update({ state: undefined, page: undefined })}>Show all</button> : null}</div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <section className="engineer-inspection-table" aria-label="Inspection records" aria-live="polite" aria-busy={loading}>
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
      {!loading && rows.length === 0 ? <p className="engineer-empty">{view === "All" ? "No inspections yet." : view === "In Progress" ? "You have no inspections currently in progress." : `No ${view.toLowerCase()} inspections.`}</p> : null}
      {!loading && visible.length > 0 ? <footer><span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, visible.length)} of {visible.length} inspections</span><nav aria-label="Inspection pages"><button disabled={page === 1} onClick={() => setPage(page - 1)} type="button">&lsaquo;</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <button aria-current={page === number ? "page" : undefined} key={number} onClick={() => setPage(number)} type="button">{number}</button>)}<button disabled={page === totalPages} onClick={() => setPage(page + 1)} type="button">&rsaquo;</button></nav></footer> : null}
    </section>
  </div>;
}
