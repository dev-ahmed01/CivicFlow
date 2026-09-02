"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Agency, CivicWorkCalendarItem, CivicWorkLedgerItem, CivicWorkLedgerLocation, CivicWorkPeriod, PaginationMeta, RoadSegmentSummary, WardSummary } from "@civicos/shared";
import { PageHeader } from "../../_components/ui";
import { apiFetch, getSession } from "../_lib/api";
import { WorkLedger } from "./work-ledger";
import { WorkTimeline } from "./work-timeline";

const WorkMap = dynamic(() => import("./work-map").then((module) => module.WorkMap), {
  ssr: false,
  loading: () => <div className="work-map-loading">Preparing the spatial view…</div>,
});

type WorkspaceView = "MAP" | "TIMELINE";
type MapBounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
type CalendarResponse = { works: CivicWorkCalendarItem[]; asOf: string; pagination: PaginationMeta };
type LedgerResponse = { location: CivicWorkLedgerLocation; works: CivicWorkLedgerItem[]; pagination: PaginationMeta };

const bengaluruDemoBounds: MapBounds = { minLongitude: 77.56, minLatitude: 12.82, maxLongitude: 77.72, maxLatitude: 12.995 };

function dateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialDateRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  const to = new Date(today);
  from.setDate(from.getDate() - 120);
  to.setDate(to.getDate() + 245);
  return { from: dateInput(from), to: dateInput(to) };
}

function asIsoDate(value: string, end = false): string {
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}+05:30`).toISOString();
}

function periodLabel(period: CivicWorkPeriod): string {
  return period === "PAST" ? "Past" : period === "CURRENT" ? "Happening now" : "Upcoming";
}

export function WorkCalendarClient() {
  const [initialRange] = useState(initialDateRange);
  const [view, setView] = useState<WorkspaceView>("MAP");
  const [search, setSearch] = useState("");
  const [moreFilters, setMoreFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [wardId, setWardId] = useState("");
  const [roadSegmentId, setRoadSegmentId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [mapBounds, setMapBounds] = useState<MapBounds>(bengaluruDemoBounds);
  const [period, setPeriod] = useState<"ALL" | CivicWorkPeriod>("ALL");
  const [workState, setWorkState] = useState("ALL");
  const [works, setWorks] = useState<CivicWorkCalendarItem[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [roads, setRoads] = useState<RoadSegmentSummary[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [resultTotal, setResultTotal] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ledger, setLedger] = useState<LedgerResponse>();
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const calendarRequestId = useRef(0);
  const ledgerRequestId = useRef(0);

  useEffect(() => {
    void Promise.all([apiFetch<{ wards: WardSummary[] }>("/wards"), apiFetch<{ agencies: Agency[] }>("/agencies")])
      .then(([wardResult, agencyResult]) => { setWards(wardResult.wards); setAgencies(agencyResult.agencies); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load schedule filters"));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams();
    if (wardId) query.set("ward", wardId);
    void apiFetch<{ segments: RoadSegmentSummary[] }>(`/road-segments?${query.toString()}`)
      .then(({ segments }) => {
        setRoads(segments);
        setRoadSegmentId((current) => current && !segments.some(({ id }) => id === current) ? "" : current);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load roads"));
  }, [wardId]);

  const loadCalendar = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    const requestId = ++calendarRequestId.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ dateFrom: asIsoDate(dateFrom), dateTo: asIsoDate(dateTo, true), limit: "200" });
      if (wardId) query.set("wardId", wardId);
      if (roadSegmentId) query.set("roadSegmentId", roadSegmentId);
      if (agencyId) query.set("agencyId", agencyId);
      for (const [key, value] of Object.entries(mapBounds)) query.set(key, String(value));
      const result = await apiFetch<CalendarResponse>(`/civic-works/calendar?${query.toString()}`);
      if (requestId !== calendarRequestId.current) return;
      setWorks(result.works);
      setResultTotal(result.pagination.total);
      setSelectedId((current) => current && result.works.some(({ id }) => id === current) ? current : undefined);
      setError(undefined);
    } catch (reason) {
      if (requestId !== calendarRequestId.current) return;
      setError(reason instanceof Error ? reason.message : "Could not load civic works");
      setWorks([]);
      setResultTotal(0);
    } finally {
      if (requestId === calendarRequestId.current) setLoading(false);
    }
  }, [agencyId, dateFrom, dateTo, mapBounds, roadSegmentId, wardId]);

  useEffect(() => { void loadCalendar(); }, [loadCalendar]);

  const loadLedger = useCallback(async (page = 1) => {
    if (!roadSegmentId && !wardId) { setLedger(undefined); return; }
    const requestId = ++ledgerRequestId.current;
    setLedgerLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), limit: "10" });
      if (roadSegmentId) query.set("roadSegmentId", roadSegmentId);
      else query.set("wardId", wardId);
      const result = await apiFetch<LedgerResponse>(`/civic-works/ledger?${query.toString()}`);
      if (requestId !== ledgerRequestId.current) return;
      setLedger(result);
      setLedgerPage(page);
      setError(undefined);
    } catch (reason) {
      if (requestId !== ledgerRequestId.current) return;
      setError(reason instanceof Error ? reason.message : "Could not load road history");
      setLedger(undefined);
    } finally {
      if (requestId === ledgerRequestId.current) setLedgerLoading(false);
    }
  }, [roadSegmentId, wardId]);

  useEffect(() => { if (historyOpen) void loadLedger(1); }, [historyOpen, loadLedger]);

  const selected = works.find(({ id }) => id === selectedId);
  const counts = useMemo(() => works.reduce((summary, work) => { summary[work.period] += 1; return summary; }, { PAST: 0, CURRENT: 0, FUTURE: 0 }), [works]);
  const visibleWorks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return works.filter((work) => (period === "ALL" || work.period === period) && (workState === "ALL" || work.state === workState) && (!query || [work.title, work.locationLabel, work.roadSegment?.roadName, work.ward?.name, work.agency.name].some((value) => value?.toLowerCase().includes(query))));
  }, [period, search, workState, works]);
  const ownAgencyId = getSession()?.user.agencyId;

  const openHistory = () => {
    if (selected?.roadSegment) { setWardId(selected.roadSegment.ward.id); setRoadSegmentId(selected.roadSegment.id); }
    else if (selected?.ward) setWardId(selected.ward.id);
    setHistoryOpen(true);
  };

  return <div className="work-calendar-page ph-schedule-page">
    <PageHeader title="City Work Map" description="See who is doing what, where and when across municipal agencies." action={<span className="ph-result-count">{resultTotal} works in view</span>} />

    <section aria-label="Schedule filters" className="ph-schedule-filter-bar">
      <label className="ph-location-search"><span>Search location or work</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Road, ward, work or agency" /></label>
      <label><span>Ward</span><select value={wardId} onChange={(event) => { setWardId(event.target.value); setRoadSegmentId(""); setHistoryOpen(false); }}><option value="">All wards</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label>
      <label><span>Agency</span><select value={agencyId} onChange={(event) => setAgencyId(event.target.value)}><option value="">All agencies</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select></label>
      <button aria-expanded={moreFilters} className="ph-secondary-button" onClick={() => setMoreFilters((open) => !open)} type="button">{moreFilters ? "Fewer filters" : "Date & more filters"}</button>
    </section>
    {moreFilters ? <section className="ph-schedule-more-filters"><label><span>Road / area</span><select value={roadSegmentId} onChange={(event) => { setRoadSegmentId(event.target.value); setHistoryOpen(false); }}><option value="">{wardId ? "Entire ward" : "All mapped roads"}</option>{roads.map((road) => <option key={road.id} value={road.id}>{road.roadName}</option>)}</select></label><label><span>Work status</span><select value={workState} onChange={(event) => setWorkState(event.target.value)}><option value="ALL">All statuses</option><option value="CREATED">Created</option><option value="PENDING_UPTAKE">Assigned</option><option value="UPTAKEN">Accepted</option><option value="TIMELINE_SET">Scheduled</option><option value="CONFLICT_CHECKED">Conflict checked</option><option value="READY_TO_START">Ready to start</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="AWAITING_VERIFICATION">Awaiting verification</option><option value="CLOSED">Closed</option><option value="CANCELLED">Cancelled</option></select></label><label><span>From</span><input max={dateTo} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label><span>To</span><input min={dateFrom} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></section> : null}

    <div className="work-calendar-toolbar">
      <div aria-label="Schedule view" className="work-calendar-tabs" role="tablist">{(["MAP", "TIMELINE"] as const).map((item) => <button aria-selected={view === item} className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} role="tab" type="button">{item === "MAP" ? "Map" : "Timeline"}</button>)}</div>
      <div aria-label="Time classification" className="work-period-filters"><button aria-pressed={period === "ALL"} onClick={() => setPeriod("ALL")} type="button"><strong>{works.length}</strong> All</button>{(["PAST", "CURRENT", "FUTURE"] as const).map((item) => <button aria-pressed={period === item} data-period={item.toLowerCase()} key={item} onClick={() => setPeriod(item)} type="button"><strong>{counts[item]}</strong> {periodLabel(item)}</button>)}</div>
    </div>

    {error ? <p className="work-calendar-error" role="alert">{error}</p> : null}
    {loading ? <p className="work-calendar-progress" role="status">Updating the spatial work view…</p> : null}

    <div className="work-calendar-workspace">
      <section className="work-calendar-main">{view === "MAP" ? <WorkMap bounds={mapBounds} onBoundsChange={setMapBounds} onSelect={setSelectedId} selectedId={selectedId} works={visibleWorks} /> : <WorkTimeline onSelect={setSelectedId} selectedId={selectedId} works={visibleWorks} />}{!loading && visibleWorks.length === 0 ? <div className="work-calendar-empty"><strong>No civic works match this view.</strong><span>Try a wider date range, another ward, or clear the agency filter.</span></div> : null}</section>
      <aside aria-label="Selected work details" className="work-detail-panel">{selected ? <><div className="work-detail-kicker"><span data-period={selected.period.toLowerCase()}>{periodLabel(selected.period)}</span><code>{selected.referenceNumber}</code></div><h2>{selected.title}</h2><p className="work-detail-agency">{selected.agency.name}<small>{selected.agency.type}</small></p><dl><div><dt>Work origin</dt><dd>{selected.origin.replaceAll("_", " ").toLowerCase()}</dd></div><div><dt>Location</dt><dd>{selected.locationLabel ?? selected.roadSegment?.roadName ?? selected.ward?.name ?? "Mapped location"}</dd></div><div><dt>Road / ward</dt><dd>{selected.roadSegment?.roadName ?? "No linked road"} · {selected.ward?.name ?? "Ward pending"}</dd></div><div><dt>Planned dates</dt><dd>{selected.plannedStart && selected.plannedEnd ? `${new Date(selected.plannedStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} - ${new Date(selected.plannedEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "Timeline pending"}</dd></div><div><dt>Actual dates</dt><dd>{selected.actualStart ? `${new Date(selected.actualStart).toLocaleDateString("en-IN")} → ${selected.actualCompletion ? new Date(selected.actualCompletion).toLocaleDateString("en-IN") : "in progress"}` : "Not started"}</dd></div><div><dt>Status</dt><dd>{selected.state.replaceAll("_", " ").toLowerCase()}</dd></div><div><dt>Responsible Engineer</dt><dd>{selected.engineer?.email ?? "Unassigned"}</dd></div><div><dt>Dependencies</dt><dd>{selected.dependencySummary.total === 0 ? "None" : selected.dependencySummary.blocked ? `Waiting on ${selected.dependencySummary.blockedBy.map(({ name }) => name).join(", ")}` : `${selected.dependencySummary.fulfilled} fulfilled`}</dd></div><div><dt>Generic conflicts</dt><dd>{selected.conflictCount || "None detected"}</dd></div><div><dt>Road conflicts</dt><dd>{selected.roadConflictCount || "None detected"}</dd></div><div><dt>Coordination status</dt><dd>{selected.conflictCount + selected.roadConflictCount > 0 ? "Advisory warning requires review" : "No warning"}</dd></div></dl>{selected.agency.id === ownAgencyId ? <a className="work-detail-link" href={`/project-head/projects/${selected.id}`}>Open work record →</a> : <p className="work-detail-readonly">Cross-agency work · read-only context</p>}{selected.roadSegment || selected.ward ? <button className="ph-tertiary-button" onClick={openHistory} type="button">View road history →</button> : null}</> : <div className="work-detail-placeholder"><h2>Select a civic work</h2><p>Choose a mapped work or timeline row to see responsibility, timing, dependencies, and coordination state.</p></div>}</aside>
    </div>

    {historyOpen ? <section className="ph-schedule-history"><header><div><h2>Road and location history</h2><p>Permanent civic work history for the selected road or ward.</p></div><button className="ph-secondary-button" onClick={() => setHistoryOpen(false)} type="button">Close history</button></header><WorkLedger ledger={ledger} loading={ledgerLoading} onPageChange={(nextPage) => void loadLedger(nextPage)} page={ledgerPage} roadSelected={Boolean(roadSegmentId)} wardSelected={Boolean(wardId)} /></section> : null}
  </div>;
}
