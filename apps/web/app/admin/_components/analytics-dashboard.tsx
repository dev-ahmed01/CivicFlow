"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  OperationalAnalyticsReport,
  OperationalBreakdownRow,
  OperationalMetric,
  OperationalMetricKey,
  OperationalRecord,
} from "@civicos/shared";
import { adminApiFetch } from "../_lib/api";

type Option = { id: string; name: string };
type Options = { wards: Option[]; categories: Option[]; agencies: Option[] };
type Filters = { wardId: string; categoryId: string; agencyId: string; from: string; to: string };
type Selection = { title: string; description: string; records: OperationalRecord[] };

const emptyFilters: Filters = { wardId: "", categoryId: "", agencyId: "", from: "", to: "" };

function queryString(filters: Filters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function metricValue(metric: OperationalMetric): string {
  if (metric.value === null) return "No data";
  if (metric.unit === "hours") return `${metric.value.toLocaleString("en-IN")} h`;
  if (metric.unit === "percent") return `${metric.value.toLocaleString("en-IN")}%`;
  return metric.value.toLocaleString("en-IN");
}

function metricContext(metric: OperationalMetric): string {
  if (metric.sampleSize !== undefined) return `${metric.sampleSize} response${metric.sampleSize === 1 ? "" : "s"} measured`;
  if (metric.denominator !== undefined) return `${metric.numerator ?? 0} of ${metric.denominator} records`;
  return "Open record list";
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function RecordsTable({ selection }: { selection: Selection }) {
  return <section className="analytics-records" aria-live="polite">
    <header><div><p className="eyebrow">Linked records</p><h2>{selection.title}</h2><p>{selection.description}</p></div><strong>{selection.records.length} record{selection.records.length === 1 ? "" : "s"}</strong></header>
    {selection.records.length === 0 ? <p className="portal-muted">No qualifying records in this work cohort.</p> : <div className="table-scroll"><table><thead><tr><th>Record</th><th>Work</th><th>Agency coordination</th><th>Status</th><th>Recorded</th><th>Evidence</th></tr></thead><tbody>{selection.records.map((record) => <tr key={`${record.recordType}:${record.id}`}>
      <td><strong>{record.recordType.replace("-", " ")}</strong><small>{record.reference}</small></td>
      <td><strong>{record.title}</strong><small>{record.relatedReference ?? record.ward ?? "—"}</small></td>
      <td>{record.agency}<small>{record.counterpartAgency ? `with ${record.counterpartAgency}` : record.category ?? "—"}</small></td>
      <td><span className="operational-status">{record.status.replaceAll("_", " ")}</span></td>
      <td>{formatDate(record.occurredAt)}{record.deadline ? <small>Deadline {formatDate(record.deadline)}</small> : null}</td>
      <td>{record.durationHours !== undefined ? `${record.durationHours} h` : record.detail ?? "—"}{record.durationHours !== undefined && record.detail ? <small>{record.detail}</small> : null}</td>
    </tr>)}</tbody></table></div>}
  </section>;
}

function Breakdown({ title, rows, onSelect }: { title: string; rows: OperationalBreakdownRow[]; onSelect: (title: string, records: OperationalRecord[]) => void }) {
  return <section className="operational-breakdown"><h2>{title}</h2>{rows.length === 0 ? <p className="portal-muted">No matching work.</p> : <ol>{rows.map((row) => <li key={`${title}:${row.dimensionId ?? row.dimension}`}><button type="button" onClick={() => onSelect(`${title}: ${row.dimension}`, row.records)}><span>{row.dimension}</span><strong>{row.count}</strong></button></li>)}</ol>}</section>;
}

export function AnalyticsDashboard() {
  const [options, setOptions] = useState<Options>({ wards: [], categories: [], agencies: [] });
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [report, setReport] = useState<OperationalAnalyticsReport>();
  const [selectedMetric, setSelectedMetric] = useState<OperationalMetricKey>("conflicts-before-execution");
  const [breakdownSelection, setBreakdownSelection] = useState<Selection>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(true);
  const query = useMemo(() => queryString(appliedFilters), [appliedFilters]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setReport(await adminApiFetch<OperationalAnalyticsReport>(`/analytics/admin/operations${query}`));
      setBreakdownSelection(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load operational analytics");
    } finally {
      setBusy(false);
    }
  }, [query]);

  useEffect(() => {
    void adminApiFetch<Options>("/analytics/admin/options").then(setOptions).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not load analytics options");
    });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selection = useMemo<Selection | undefined>(() => {
    if (breakdownSelection) return breakdownSelection;
    const selected = report?.metrics.find(({ key }) => key === selectedMetric);
    if (!selected || !report) return undefined;
    return { title: selected.label, description: selected.description, records: report.details[selected.key] };
  }, [breakdownSelection, report, selectedMetric]);

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const selectMetric = (key: OperationalMetricKey) => { setSelectedMetric(key); setBreakdownSelection(undefined); };
  const selectBreakdown = (title: string, records: OperationalRecord[]) => setBreakdownSelection({
    title,
    records,
    description: "Works in this breakdown. Counts and rows come from the same filtered project records.",
  });

  return <>
    <header className="portal-heading"><div><p className="eyebrow">Phase 7 · Resource conservation</p><h1>Operational coordination</h1><p>Record-backed signals for preventing repeated work and reducing inter-agency delay. No financial savings are inferred.</p></div></header>
    <section className="filter-bar analytics-filters" aria-label="Operational analytics filters">
      <label>Ward<select value={filters.wardId} onChange={(event) => setFilter("wardId", event.target.value)}><option value="">All wards</option>{options.wards.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Work type<select value={filters.categoryId} onChange={(event) => setFilter("categoryId", event.target.value)}><option value="">All types</option>{options.categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Owning agency<select value={filters.agencyId} onChange={(event) => setFilter("agencyId", event.target.value)}><option value="">All agencies</option>{options.agencies.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>Work created from<input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} /></label>
      <label>Work created to<input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} /></label>
      <button type="button" onClick={() => setAppliedFilters(filters)}>Apply</button>
      <button className="secondary" type="button" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); }}>Clear</button>
    </section>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {busy ? <p className="portal-muted" role="status">Computing metrics from operational records…</p> : null}
    {report ? <>
      <section className="operational-metric-grid" aria-label="Operational metrics">{report.metrics.map((item) => <button aria-pressed={!breakdownSelection && selectedMetric === item.key} className="operational-metric" key={item.key} onClick={() => selectMetric(item.key)} type="button"><span>{item.label}</span><strong>{metricValue(item)}</strong><small>{metricContext(item)} →</small></button>)}</section>
      <section className="conservation-inputs"><header><div><p className="eyebrow">Savings-model inputs</p><h2>Measured, not monetised</h2></div><p>{report.conservationInputs.note}</p></header><dl><div><dt>Road segments at repeated-work risk</dt><dd>{report.conservationInputs.repeatedRiskSegments}</dd></div><div><dt>Affected intervention length</dt><dd>{report.conservationInputs.affectedLengthMeters.toLocaleString("en-IN")} m</dd></div><div><dt>Accepted sequencing recommendations</dt><dd>{report.conservationInputs.acceptedSequencingRecommendations}</dd></div></dl></section>
      <div className="operational-breakdowns"><Breakdown title="Work by agency" rows={report.workBreakdown.byAgency} onSelect={selectBreakdown} /><Breakdown title="Work by ward" rows={report.workBreakdown.byWard} onSelect={selectBreakdown} /><Breakdown title="Work by type" rows={report.workBreakdown.byType} onSelect={selectBreakdown} /></div>
      {selection ? <RecordsTable selection={selection} /> : null}
      <p className="generated-at">Updated {new Date(report.generatedAt).toLocaleString("en-IN")}</p>
    </> : null}
  </>;
}
