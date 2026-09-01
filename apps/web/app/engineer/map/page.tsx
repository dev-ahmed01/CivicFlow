"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CivicWorkCalendarItem } from "@civicos/shared";
import { apiFetch, getSession } from "../_lib/api";

const WorkMap = dynamic(() => import("../../project-head/work-calendar/work-map").then((module) => module.WorkMap), { ssr: false, loading: () => <div className="work-map-loading">Preparing field map…</div> });
type Bounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
const initialBounds: Bounds = { minLongitude: 77.56, minLatitude: 12.82, maxLongitude: 77.72, maxLatitude: 12.995 };

export default function EngineerMapPage() {
  const [bounds, setBounds] = useState(initialBounds);
  const [works, setWorks] = useState<CivicWorkCalendarItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    const from = new Date(); from.setMonth(from.getMonth() - 3);
    const to = new Date(); to.setMonth(to.getMonth() + 9);
    const query = new URLSearchParams({ dateFrom: from.toISOString(), dateTo: to.toISOString(), limit: "200" });
    Object.entries(bounds).forEach(([key, value]) => query.set(key, String(value)));
    try { setWorks((await apiFetch<{ works: CivicWorkCalendarItem[] }>(`/civic-works/calendar?${query}`)).works); setError(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load field map"); }
  }, [bounds]);
  useEffect(() => { void load(); }, [load]);
  const selected = works.find(({ id }) => id === selectedId);
  const ownAgencyId = getSession()?.user.agencyId;
  return <div className="field-module engineer-map-page"><header className="portal-heading"><div><p className="eyebrow">Field location context</p><h1>Map</h1><p>Your work, active dependencies, and nearby municipal activity in one operational view.</p></div></header>{error ? <p className="error">{error}</p> : null}<div className="work-calendar-workspace"><section className="work-calendar-main"><WorkMap bounds={bounds} onBoundsChange={setBounds} onSelect={setSelectedId} selectedId={selectedId} works={works} /></section><aside className="work-detail-panel">{selected ? <><div className="work-detail-kicker"><span data-period={selected.period.toLowerCase()}>{selected.period}</span><code>{selected.referenceNumber}</code></div><h2>{selected.title}</h2><p className="work-detail-agency">{selected.agency.name}<small>{selected.agency.type}</small></p><dl><div><dt>Location</dt><dd>{selected.locationLabel ?? selected.roadSegment?.roadName ?? "Mapped location"}</dd></div><div><dt>State</dt><dd>{selected.state.replaceAll("_", " ")}</dd></div><div><dt>Dates</dt><dd>{selected.plannedStart ? new Date(selected.plannedStart).toLocaleDateString("en-IN") : "Pending"} → {selected.plannedEnd ? new Date(selected.plannedEnd).toLocaleDateString("en-IN") : "Pending"}</dd></div><div><dt>Dependencies</dt><dd>{selected.dependencySummary.total}</dd></div><div><dt>Conflict warnings</dt><dd>{selected.conflictCount + selected.roadConflictCount}</dd></div></dl>{selected.agency.id === ownAgencyId && selected.engineer?.id === getSession()?.user.id ? <Link className="work-detail-link" href={`/engineer/projects/${selected.id}`}>Open my work →</Link> : <p className="work-detail-readonly">Cross-agency context · read only</p>}</> : <div className="work-detail-placeholder"><h2>Select mapped work</h2><p>Nearby works are visible for coordination. Only your assigned work is actionable.</p></div>}</aside></div></div>;
}
