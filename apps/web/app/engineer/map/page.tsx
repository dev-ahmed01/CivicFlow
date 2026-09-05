"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EngineerTip, EngineerSymbol } from "../_components/engineer-ui";
import type { CivicWorkCalendarItem } from "@civicos/shared";
import { apiFetch, getSession } from "../_lib/api";

const WorkMap = dynamic(() => import("../../project-head/work-calendar/work-map").then((module) => module.WorkMap), { ssr: false, loading: () => <div className="work-map-loading">Preparing field map…</div> });
type Bounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
const initialBounds: Bounds = { minLongitude: 77.56, minLatitude: 12.82, maxLongitude: 77.72, maxLatitude: 12.995 };

export default function EngineerMapPage() {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<string>();
  const [category, setCategory] = useState<string>();
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const categories = [
    { label: "Active work", icon: "connected", tone: "green", matches: (work: CivicWorkCalendarItem) => work.state === "ACTIVE" },
    { label: "Needs attention", icon: "attention", tone: "amber", matches: (work: CivicWorkCalendarItem) => work.conflictCount + work.roadConflictCount > 0 },
    { label: "Dependencies", icon: "people", tone: "blue", matches: (work: CivicWorkCalendarItem) => work.dependencySummary.open > 0 },
    { label: "Upcoming work", icon: "calendar", tone: "gray", matches: (work: CivicWorkCalendarItem) => work.period === "FUTURE" },
    { label: "Blocked", icon: "blocked", tone: "red", matches: (work: CivicWorkCalendarItem) => work.dependencySummary.blocked },
  ];
  const filteredWorks = useMemo(() => works.filter((work) => (!period || work.period === period) && (work.title + " " + (work.locationLabel ?? "") + " " + work.agency.name).toLowerCase().includes(search.toLowerCase()) && (!category || (category === "Active work" ? work.state === "ACTIVE" : category === "Needs attention" ? work.conflictCount + work.roadConflictCount > 0 : category === "Dependencies" ? work.dependencySummary.open > 0 : category === "Upcoming work" ? work.period === "FUTURE" : work.dependencySummary.blocked))), [works, period, search, category]);
  const selected = filteredWorks.find(({ id }) => id === selectedId);
  const ownAgencyId = getSession()?.user.agencyId;
  return <div className="field-module engineer-map-page"><header className="portal-heading"><div><p className="eyebrow">Field location context</p><h1>Map</h1><p>Your work, active dependencies, and nearby municipal activity in one operational view.</p></div><div className="engineer-dependency-summary"><strong>{works.filter((work) => work.engineer?.id === getSession()?.user.id && ["ACTIVE", "ASSIGNED", "PLANNED"].includes(work.state)).length}</strong><span>assigned works</span></div></header><div className="engineer-map-toolbar"><div className="engineer-periods">{[{ id: "PAST", label: "Past" }, { id: "CURRENT", label: "Happening now" }, { id: "FUTURE", label: "Upcoming" }].map((item) => <button key={item.id} type="button" data-period={item.id.toLowerCase()} aria-pressed={period === item.id} onClick={() => setPeriod(period === item.id ? undefined : item.id)}>{item.label}</button>)}</div><input aria-label="Search this map region" placeholder="Search this map region" value={search} onChange={(event) => setSearch(event.target.value)} /></div>{error ? <p className="error">{error}</p> : null}<div className="work-calendar-workspace"><section className="work-calendar-main"><WorkMap bounds={bounds} onBoundsChange={setBounds} onSelect={setSelectedId} selectedId={selected?.id} works={filteredWorks} /></section><aside className="work-detail-panel">{selected ? <><button className="engineer-map-back" type="button" onClick={() => setSelectedId(undefined)}>&larr; All mapped work</button><div className="work-detail-kicker"><span data-period={selected.period.toLowerCase()}>{selected.period}</span><code>{selected.referenceNumber}</code></div><h2>{selected.title}</h2><p className="work-detail-agency">{selected.agency.name}<small>{selected.agency.type}</small></p><dl><div><dt>Location</dt><dd>{selected.locationLabel ?? selected.roadSegment?.roadName ?? "Mapped location"}</dd></div><div><dt>State</dt><dd>{selected.state.replaceAll("_", " ")}</dd></div><div><dt>Dates</dt><dd>{selected.plannedStart ? new Date(selected.plannedStart).toLocaleDateString("en-IN") : "Pending"} → {selected.plannedEnd ? new Date(selected.plannedEnd).toLocaleDateString("en-IN") : "Pending"}</dd></div><div><dt>Dependencies</dt><dd>{selected.dependencySummary.total}</dd></div><div><dt>Conflict warnings</dt><dd>{selected.conflictCount + selected.roadConflictCount}</dd></div></dl>{selected.agency.id === ownAgencyId && selected.engineer?.id === getSession()?.user.id ? <Link className="work-detail-link" href={`/engineer/projects/${selected.id}`}>Open my work →</Link> : <p className="work-detail-readonly">Cross-agency context · read only</p>}</> : <div className="engineer-map-overview"><h2>Select mapped work</h2><p>Nearby works are visible for coordination. Only your assigned work is actionable.</p><div className="engineer-map-categories">{categories.map((item) => <button type="button" key={item.label} aria-pressed={category === item.label} onClick={() => setCategory(category === item.label ? undefined : item.label)}><span className={"engineer-symbol " + item.tone}><EngineerSymbol name={item.icon} /></span><span><strong>{item.label}</strong><small>{works.filter(item.matches).length} locations</small></span><span aria-hidden="true">&rsaquo;</span></button>)}</div><button className="engineer-map-filter" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}>Filter map</button>{filtersOpen ? <div className="engineer-map-filter-options"><p>{filteredWorks.length} mapped works match your filters.</p><button type="button" onClick={() => { setCategory(undefined); setPeriod(undefined); setSearch(""); }}>Clear all filters</button></div> : null}</div>}</aside></div>{filteredWorks.length === 0 && !error ? <p role="status">No mapped work matches this view. Try another period or clear the filters.</p> : null}<EngineerTip>Click on any map marker to view details, assigned agency, status, and dependencies.<br />Use filters to focus on specific types of work.</EngineerTip></div>;
}
