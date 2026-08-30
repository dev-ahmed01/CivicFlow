"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Agency,
  CivicWorkCalendarItem,
  CivicWorkLedgerItem,
  CivicWorkLedgerLocation,
  CivicWorkPeriod,
  PaginationMeta,
  RoadSegmentSummary,
  WardSummary,
} from "@civicos/shared";
import { getSession, apiFetch } from "../_lib/api";
import { WorkLedger } from "./work-ledger";
import { WorkTimeline } from "./work-timeline";

const WorkMap = dynamic(() => import("./work-map").then((module) => module.WorkMap), {
  ssr: false,
  loading: () => <div className="work-map-loading">Preparing the spatial view…</div>,
});

type WorkspaceView = "MAP" | "TIMELINE" | "LEDGER";
type MapBounds = { minLongitude: number; minLatitude: number; maxLongitude: number; maxLatitude: number };
type CalendarResponse = { works: CivicWorkCalendarItem[]; asOf: string; pagination: PaginationMeta };
type LedgerResponse = { location: CivicWorkLedgerLocation; works: CivicWorkLedgerItem[]; pagination: PaginationMeta };

const bengaluruDemoBounds: MapBounds = {
  minLongitude: 77.56,
  minLatitude: 12.82,
  maxLongitude: 77.72,
  maxLatitude: 12.995,
};

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
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [wardId, setWardId] = useState("");
  const [roadSegmentId, setRoadSegmentId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [mapBounds, setMapBounds] = useState<MapBounds>(bengaluruDemoBounds);
  const [period, setPeriod] = useState<"ALL" | CivicWorkPeriod>("ALL");
  const [works, setWorks] = useState<CivicWorkCalendarItem[]>([]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [roads, setRoads] = useState<RoadSegmentSummary[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [resultTotal, setResultTotal] = useState(0);
  const [ledger, setLedger] = useState<LedgerResponse>();
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const calendarRequestId = useRef(0);
  const ledgerRequestId = useRef(0);

  useEffect(() => {
    void Promise.all([
      apiFetch<{ wards: WardSummary[] }>("/wards"),
      apiFetch<{ agencies: Agency[] }>("/agencies"),
    ]).then(([wardResult, agencyResult]) => {
      setWards(wardResult.wards);
      setAgencies(agencyResult.agencies);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load calendar filters"));
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
      const query = new URLSearchParams({
        dateFrom: asIsoDate(dateFrom),
        dateTo: asIsoDate(dateTo, true),
        limit: "200",
      });
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
    if (!roadSegmentId && !wardId) {
      setLedger(undefined);
      return;
    }
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
      setError(reason instanceof Error ? reason.message : "Could not load the work ledger");
      setLedger(undefined);
    } finally {
      if (requestId === ledgerRequestId.current) setLedgerLoading(false);
    }
  }, [roadSegmentId, wardId]);

  useEffect(() => {
    if (view === "LEDGER") void loadLedger(1);
  }, [loadLedger, view]);

  const visibleWorks = period === "ALL" ? works : works.filter((work) => work.period === period);
  const selected = works.find(({ id }) => id === selectedId);
  const counts = useMemo(() => works.reduce((summary, work) => {
    summary[work.period] += 1;
    return summary;
  }, { PAST: 0, CURRENT: 0, FUTURE: 0 }), [works]);
  const ownAgencyId = getSession()?.user.agencyId;

  return <div className="work-calendar-page">
    <header className="work-calendar-heading">
      <div><p className="eyebrow">Spatial coordination</p><h1>Civic work calendar</h1><p>See who is doing what, where and when—across past work, active delivery, and upcoming plans.</p></div>
      <div className="work-calendar-result"><strong>{resultTotal}</strong><span>works in view</span></div>
    </header>

    <section aria-label="Calendar filters" className="work-calendar-filters">
      <label>Ward<select value={wardId} onChange={(event) => { setWardId(event.target.value); setRoadSegmentId(""); }}><option value="">Map region</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label>
      <label>Road / area<select value={roadSegmentId} onChange={(event) => setRoadSegmentId(event.target.value)}><option value="">{wardId ? "Entire ward" : "All mapped roads"}</option>{roads.map((road) => <option key={road.id} value={road.id}>{road.roadName}</option>)}</select></label>
      <label>Agency<select value={agencyId} onChange={(event) => setAgencyId(event.target.value)}><option value="">All agencies</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}</select></label>
      <label>From<input max={dateTo} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
      <label>To<input min={dateFrom} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
    </section>

    <div className="work-calendar-toolbar">
      <div aria-label="Calendar view" className="work-calendar-tabs" role="tablist">
        {(["MAP", "TIMELINE", "LEDGER"] as const).map((item) => <button aria-selected={view === item} className={view === item ? "active" : ""} key={item} onClick={() => setView(item)} role="tab" type="button">{item === "LEDGER" ? "Work ledger" : item[0] + item.slice(1).toLowerCase()}</button>)}
      </div>
      <div aria-label="Time classification" className="work-period-filters">
        <button aria-pressed={period === "ALL"} onClick={() => setPeriod("ALL")} type="button"><strong>{works.length}</strong> All</button>
        {(["PAST", "CURRENT", "FUTURE"] as const).map((item) => <button aria-pressed={period === item} data-period={item.toLowerCase()} key={item} onClick={() => setPeriod(item)} type="button"><strong>{counts[item]}</strong> {periodLabel(item)}</button>)}
      </div>
    </div>

    {error ? <p className="work-calendar-error" role="alert">{error}</p> : null}
    {loading ? <p className="work-calendar-progress" role="status">Updating the bounded work view…</p> : null}

    {view === "LEDGER" ? <WorkLedger
      ledger={ledger}
      loading={ledgerLoading}
      onPageChange={(page) => void loadLedger(page)}
      page={ledgerPage}
      roadSelected={Boolean(roadSegmentId)}
      wardSelected={Boolean(wardId)}
    /> : <div className="work-calendar-workspace">
      <section className="work-calendar-main">
        {view === "MAP" ? <WorkMap bounds={mapBounds} onBoundsChange={setMapBounds} onSelect={setSelectedId} selectedId={selectedId} works={visibleWorks} /> : <WorkTimeline onSelect={setSelectedId} selectedId={selectedId} works={visibleWorks} />}
        {!loading && visibleWorks.length === 0 ? <div className="work-calendar-empty"><strong>No civic works match this view.</strong><span>Try a wider date range, another ward, or clear the agency filter.</span></div> : null}
      </section>
      <aside aria-label="Selected work details" className="work-detail-panel">
        {selected ? <>
          <div className="work-detail-kicker"><span data-period={selected.period.toLowerCase()}>{periodLabel(selected.period)}</span><code>{selected.referenceNumber}</code></div>
          <h2>{selected.title}</h2>
          <p className="work-detail-agency">{selected.agency.name}<small>{selected.agency.type}</small></p>
          <dl>
            <div><dt>Location</dt><dd>{selected.locationLabel ?? selected.roadSegment?.roadName ?? selected.ward?.name ?? "Mapped location"}</dd></div>
            <div><dt>Timing</dt><dd>{selected.plannedStart && selected.plannedEnd ? `${new Date(selected.plannedStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(selected.plannedEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "Timeline pending"}</dd></div>
            <div><dt>Status</dt><dd>{selected.state.replaceAll("_", " ").toLowerCase()}</dd></div>
            <div><dt>Evidence</dt><dd>{selected.evidenceCount > 0 ? `${selected.evidenceCount} available` : "None available"}</dd></div>
            <div><dt>Dependencies</dt><dd>{selected.dependencySummary.total === 0 ? "None" : `${selected.dependencySummary.open} open · ${selected.dependencySummary.fulfilled} fulfilled`}</dd></div>
            <div><dt>Coordination</dt><dd>{selected.conflictCount + selected.roadConflictCount > 0 ? `${selected.conflictCount + selected.roadConflictCount} advisory warning${selected.conflictCount + selected.roadConflictCount === 1 ? "" : "s"}` : "No warnings"}</dd></div>
          </dl>
          {selected.description ? <div className="work-detail-scope"><h3>Work scope</h3><p>{selected.description}</p></div> : null}
          {selected.agency.id === ownAgencyId ? <a className="work-detail-link" href={`/project-head/projects/${selected.id}`}>Open project record →</a> : <p className="work-detail-readonly">Cross-agency record · read only</p>}
        </> : <div className="work-detail-placeholder"><span aria-hidden="true">⌖</span><h2>Select a civic work</h2><p>Choose a mapped work or timeline row to inspect agency, timing, status, evidence, and coordination state.</p></div>}
      </aside>
    </div>}
  </div>;
}
