"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EngineerTip, EngineerSymbol, EngineerHeader, engineerDate } from "../_components/engineer-ui";
import type { CivicWorkCalendarItem } from "@civicos/shared";
import { apiFetch, getSession } from "../_lib/api";

const WorkMap = dynamic(() => import("../../project-head/work-calendar/work-map").then((module) => module.WorkMap), { ssr: false, loading: () => <div className="work-map-loading">Preparing field map…</div> });
type Bounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
const initialBounds: Bounds = { minLongitude: 77.56, minLatitude: 12.82, maxLongitude: 77.72, maxLatitude: 12.995 };

const categories = [
    { label: "Active work", icon: "connected", tone: "green", matches: (work: CivicWorkCalendarItem) => work.state === "ACTIVE" },
    { label: "Needs attention", icon: "attention", tone: "amber", matches: (work: CivicWorkCalendarItem) => work.conflictCount + work.roadConflictCount > 0 },
    { label: "Dependencies", icon: "people", tone: "blue", matches: (work: CivicWorkCalendarItem) => work.dependencySummary.open > 0 },
    { label: "Upcoming work", icon: "calendar", tone: "gray", matches: (work: CivicWorkCalendarItem) => work.period === "FUTURE" },
    { label: "Blocked", icon: "blocked", tone: "red", matches: (work: CivicWorkCalendarItem) => work.dependencySummary.blocked },
  ];

export default function EngineerMapPage() {
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);
  const [agency, setAgency] = useState("");
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
    finally { setLoading(false); }
  }, [bounds]);
  useEffect(() => { void load(); }, [load]);
  const currentUser = getSession()?.user;
  const regionWorks = useMemo(() => works.filter((work) => (!period || work.period === period) && (!agency || work.agency.id === agency) && (!onlyMine || work.engineer?.id === currentUser?.id) && [work.title, work.locationLabel, work.agency.name, work.roadSegment?.roadName].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase())), [works, period, agency, onlyMine, currentUser?.id, search]);
  const filteredWorks = useMemo(() => regionWorks.filter((work) => !category || categories.find((item) => item.label === category)?.matches(work)), [regionWorks, category]);
  const selected = filteredWorks.find(({ id }) => id === selectedId);
  const agencies = Array.from(new Map(works.map((work) => [work.agency.id, work.agency])).values());
  const actionable = works.filter((work) => work.agency.id === currentUser?.agencyId && work.engineer?.id === currentUser?.id && ["PENDING_UPTAKE", "UPTAKEN", "READY_TO_START", "ACTIVE", "MODIFIED", "COMPLETED"].includes(work.state)).length;
  const clearFilters = () => { setCategory(undefined); setPeriod(undefined); setSearch(""); setAgency(""); setOnlyMine(false); };
  return <div className="field-module engineer-map-page">
    <EngineerHeader eyebrow="Field location context" title="Map" description="Your work, active dependencies, and nearby municipal activity in one operational view." count={loading ? undefined : actionable} countLabel="actionable tasks" />
    <div className="engineer-map-toolbar">
      <div className="engineer-periods" role="group" aria-label="Work periods">{[{ id: "PAST", label: "Past" }, { id: "CURRENT", label: "Happening now" }, { id: "FUTURE", label: "Upcoming" }].map((item) => <button key={item.id} type="button" data-period={item.id.toLowerCase()} aria-pressed={period === item.id} onClick={() => setPeriod(period === item.id ? undefined : item.id)}>{item.label}</button>)}</div>
      <label className="engineer-map-search"><EngineerSymbol name="search" /><input aria-label="Search this map region" placeholder="Search this map region" value={search} onChange={(event) => setSearch(event.target.value)} type="search" /></label>
      {period || category || search || agency || onlyMine ? <button className="engineer-text-button" type="button" onClick={clearFilters}>Clear filters</button> : null}
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="work-calendar-workspace">
      <section className="work-calendar-main"><WorkMap bounds={bounds} onBoundsChange={setBounds} onSelect={setSelectedId} selectedId={selected?.id} works={filteredWorks} /></section>
      <aside className="work-detail-panel">
        {selected ? <>
          <button className="engineer-map-back" type="button" onClick={() => setSelectedId(undefined)}>&larr; All mapped work</button>
          <div className="work-detail-kicker"><span data-period={selected.period.toLowerCase()}>{selected.period === "CURRENT" ? "Happening now" : selected.period === "PAST" ? "Past" : "Upcoming"}</span><code>{selected.referenceNumber}</code></div>
          <h2>{selected.title}</h2><p className="work-detail-agency">{selected.agency.name}<small>{selected.agency.type}</small></p>
          <dl><div><dt>Location</dt><dd>{selected.locationLabel ?? selected.roadSegment?.roadName ?? "Mapped location"}</dd></div><div><dt>State</dt><dd>{selected.state.replaceAll("_", " ")}</dd></div><div><dt>Dates</dt><dd>{engineerDate(selected.plannedStart)} &rarr; {engineerDate(selected.plannedEnd)}</dd></div><div><dt>Dependencies</dt><dd>{selected.dependencySummary.total}</dd></div><div><dt>Advisory warnings</dt><dd>{selected.conflictCount + selected.roadConflictCount}</dd></div></dl>
          {selected.agency.id === currentUser?.agencyId && selected.engineer?.id === currentUser?.id ? <Link className="work-detail-link" href={"/engineer/projects/" + selected.id}>Open my work &rarr;</Link> : <p className="work-detail-readonly">Cross-agency context &middot; read only</p>}
        </> : <div className="engineer-map-overview">
          <h2>Select mapped work</h2><p>Nearby works are visible for coordination.<br />Only your assigned work is actionable.</p>
          <div className="engineer-map-categories">{categories.map((item) => {
            const count = regionWorks.filter(item.matches).length;
            return <button type="button" key={item.label} aria-pressed={category === item.label} onClick={() => setCategory(category === item.label ? undefined : item.label)}><span className={"engineer-symbol " + item.tone}><EngineerSymbol name={item.icon} /></span><span><strong>{item.label}</strong><small>{loading ? "Loading..." : count + (count === 1 ? " location" : " locations")}</small></span><span aria-hidden="true">&rsaquo;</span></button>;
          })}</div>
          <button className="engineer-map-filter" type="button" aria-expanded={filtersOpen} aria-controls="engineer-map-filters" onClick={() => setFiltersOpen(!filtersOpen)}><EngineerSymbol name="filter" />Filter map</button>
          {filtersOpen ? <div className="engineer-map-filter-options" id="engineer-map-filters"><label>Agency<select value={agency} onChange={(event) => setAgency(event.target.value)}><option value="">All agencies</option>{agencies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="engineer-checkbox"><input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />Only my assigned work</label><p>{filteredWorks.length} mapped works match your filters.</p><button type="button" onClick={clearFilters}>Clear all filters</button></div> : null}
        </div>}
      </aside>
    </div>
    {loading ? <p className="engineer-map-status" role="status">Loading mapped work...</p> : filteredWorks.length === 0 && !error ? <p className="engineer-map-status" role="status">No mapped work matches this view. Try another period or clear the filters.</p> : null}
    <EngineerTip>Click on any map marker to view details, assigned agency, status, and dependencies.<br />Use filters to focus on specific types of work.</EngineerTip>
    {filteredWorks.length > 0 ? <details className="engineer-map-list"><summary>Mapped work list ({filteredWorks.length})</summary><ul>{filteredWorks.map((work) => <li key={work.id}><button aria-pressed={selectedId === work.id} onClick={() => { setSelectedId(work.id); document.querySelector(".work-detail-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }} type="button"><strong>{work.title}</strong><span>{work.agency.name} &middot; {work.locationLabel ?? "Mapped location"}</span></button></li>)}</ul></details> : null}
  </div>;
}
