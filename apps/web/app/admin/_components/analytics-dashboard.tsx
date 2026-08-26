"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalyticsReport, MetricRow } from "@civicos/shared";
import { adminApiFetch, downloadAdminExport } from "../_lib/api";

type Option = { id: string; name: string };
type Options = { wards: Option[]; categories: Option[]; agencies: Option[] };
type Filters = { wardId: string; categoryId: string; agencyId: string; from: string; to: string };
const emptyFilters: Filters = { wardId: "", categoryId: "", agencyId: "", from: "", to: "" };

function queryString(filters: Filters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function MetricTable({ title, rows }: { title: string; rows: MetricRow[] }) {
  return <section className="analytics-table-card"><h2>{title}</h2>{rows.length === 0 ? <p className="portal-muted">No matching data.</p> : <div className="table-scroll"><table><thead><tr><th>Dimension</th><th>Breakdown</th><th>Count / total</th><th>Rate</th><th>Avg. hours</th><th>Accepted / modified / dismissed</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.dimension}-${row.secondaryDimension ?? ""}-${index}`}><td>{row.dimension}</td><td>{row.secondaryDimension ?? "—"}</td><td>{row.count ?? "—"}{row.total !== undefined ? ` / ${row.total}` : ""}</td><td>{row.ratePercent !== undefined ? `${row.ratePercent}%` : "—"}</td><td>{row.averageHours ?? "—"}</td><td>{row.accepted !== undefined ? `${row.accepted} / ${row.modified} / ${row.dismissed}` : "—"}</td></tr>)}</tbody></table></div>}</section>;
}

export function AnalyticsDashboard() {
  const [options, setOptions] = useState<Options>({ wards: [], categories: [], agencies: [] });
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [report, setReport] = useState<AnalyticsReport>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(true);
  const query = useMemo(() => queryString(filters), [filters]);
  const load = useCallback(async () => {
    setBusy(true); setError(undefined);
    try { setReport(await adminApiFetch<AnalyticsReport>(`/analytics/admin${query}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load analytics"); }
    finally { setBusy(false); }
  }, [query]);
  useEffect(() => {
    const boot = async () => {
      try { const [loadedOptions] = await Promise.all([adminApiFetch<Options>("/analytics/admin/options"), load()]); setOptions(loadedOptions); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load analytics options"); }
    };
    void boot();
  }, [load]);

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const download = async (path: string, fileName: string) => {
    setError(undefined);
    try { await downloadAdminExport(path, fileName); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not export analytics"); }
  };
  return <>
    <header className="portal-heading"><div><p className="eyebrow">Part III §19.2</p><h1>City analytics</h1><p>Measured operational outcomes, filtered across the same report used for exports.</p></div><div className="export-actions"><button type="button" onClick={() => void download(`/analytics/admin/export.csv${query}`, "city-analytics.csv")}>Export CSV</button><button type="button" onClick={() => void download(`/analytics/admin/export.pdf${query}`, "city-analytics.pdf")}>Export PDF</button></div></header>
    <section className="filter-bar analytics-filters" aria-label="Analytics filters">
      <label>Ward<select value={filters.wardId} onChange={(event) => setFilter("wardId", event.target.value)}><option value="">All wards</option>{options.wards.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Category<select value={filters.categoryId} onChange={(event) => setFilter("categoryId", event.target.value)}><option value="">All categories</option>{options.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Agency<select value={filters.agencyId} onChange={(event) => setFilter("agencyId", event.target.value)}><option value="">All agencies</option>{options.agencies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>From<input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} /></label><label>To<input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} /></label>
      <button type="button" onClick={() => void load()}>Apply</button><button className="secondary" type="button" onClick={() => setFilters(emptyFilters)}>Clear</button>
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}{busy ? <p className="portal-muted">Computing report from live data…</p> : null}
    {report ? <>
      <section className="metric-grid analytics-totals"><div className="metric-card green"><span>Tickets created</span><strong>{report.totals.ticketsCreated}</strong><small>filtered period</small></div><div className="metric-card blue"><span>Tickets resolved</span><strong>{report.totals.ticketsResolved}</strong><small>{report.totals.resolutionRatePercent}% resolution rate</small></div><div className="metric-card amber"><span>Road conflicts</span><strong>{report.totals.roadConflicts}</strong><small>advisory detections</small></div><div className="metric-card simulated-metric"><span>Estimated restoration cost saved</span><strong>₹{report.simulatedRestorationCostSaved.amountInr.toLocaleString("en-IN")}</strong><small>{report.simulatedRestorationCostSaved.label}</small></div></section>
      <section className="simulation-note"><strong>{report.simulatedRestorationCostSaved.label}</strong><p>{report.simulatedRestorationCostSaved.formula}</p><small>Inputs: ₹{report.simulatedRestorationCostSaved.unitCostPerMeterInr.toLocaleString("en-IN")}/m × {report.simulatedRestorationCostSaved.avoidedReworkFactor} factor; {report.simulatedRestorationCostSaved.affectedLengthMeters} affected metres.</small></section>
      <div className="analytics-tables">
        <MetricTable title="Tickets by category" rows={report.ticketsByCategory} /><MetricTable title="Tickets by ward" rows={report.ticketsByWard} /><MetricTable title="Tickets by period" rows={report.ticketsByPeriod} />
        <MetricTable title="Time to validation by ward" rows={report.validationTimeByWard} /><MetricTable title="Time to inspection by agency" rows={report.inspectionTimeByAgency} /><MetricTable title="Resolution time by category and agency" rows={report.resolutionTimeByCategoryAgency} />
        <MetricTable title="Dependency response time" rows={report.dependencyResponseByAgency} /><MetricTable title="Dependency escalation rate" rows={report.dependencyEscalationByAgency} /><MetricTable title="Validator participation" rows={report.validatorParticipationByWard} />
        <MetricTable title="Conflict frequency" rows={report.conflictsByWardAgencyPair} /><MetricTable title="Rework rate" rows={report.reworkByAgencyEngineer} /><MetricTable title="Citizen “not resolved” rate" rows={report.citizenNotResolvedByAgency} />
        <MetricTable title="Road conflicts by ward and type" rows={report.roadConflictsByWardType} /><MetricTable title="Repeated excavations avoided" rows={report.repeatedExcavationsAvoidedBySegmentAgency} /><MetricTable title="Sequencing recommendations" rows={report.sequencingOutcomesByAgency} />
      </div>
    </> : null}
  </>;
}
