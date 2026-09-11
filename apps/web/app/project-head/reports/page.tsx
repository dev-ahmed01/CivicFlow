"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Category, WardSummary, InsightsPreset, OperationalAnalyticsReport, OperationalMetric, OperationalMetricKey, OperationalRecord } from "@civicos/shared";
import { EmptyState, PageHeader } from "../../_components/ui";
import { apiFetch } from "../_lib/api";
import { InsightMetric, metricChange, metricSample, metricValue, PerformanceSummary, SystemValidation } from "../_components/insight-metrics";
import { InsightTrend } from "../_components/report-charts";
import styles from "./insights.module.css";

const primary: OperationalMetricKey[] = ["conflicts-before-execution", "conflicts-resolved", "dependency-response-time", "first-time-completion"];
const sections: Array<{ title: string; description: string; keys: OperationalMetricKey[] }> = [
  { title: "Coordination performance", description: "During coordination · response, turnaround and work waiting for another agency", keys: ["coordination-turnaround", "works-blocked", "overdue-coordination", "works-coordinated"] },
  { title: "Road coordination impact", description: "Recorded risks and accepted sequencing decisions", keys: ["repeated-excavation", "risks-addressed", "coordinated-road-length", "sequencing-accepted"] },
  { title: "Accountability", description: "After execution · completion evidence and verification", keys: ["verified-closure", "evidence-backed-completion", "rework-rate"] },
];
const date = (value: string) => new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const timestamp = (value?: string) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "Not recorded";
const range = (period: { from: string; to: string }) => `${date(period.from)} – ${date(new Date(Date.parse(period.to) - 1).toISOString())}`;

function EvidenceRows({ rows }: { rows: OperationalRecord[] }) {
  const [limit, setLimit] = useState(25);
  return <>{rows.length ? <><p>{rows.length} underlying records · timestamps in Bengaluru time</p><div className="table-scroll"><table><thead><tr><th>Record / work</th><th>Ward / agencies</th><th>Outcome</th><th>Recorded evidence</th></tr></thead><tbody>{rows.slice(0, limit).map(row => <tr key={`${row.recordType}:${row.id}`}>
    <td>{row.projectId ? <Link href={`/project-head/projects/${row.projectId}`}>{row.title}</Link> : row.title}<small className={styles.recordId}>{row.recordType}: {row.reference}</small>{row.projectId ? <small className={styles.recordId}>Work: {row.projectId}</small> : null}</td>
    <td>{row.ward ?? "Ward not recorded"}<small>{row.agency}{row.counterpartAgency ? ` → ${row.counterpartAgency}` : ""}</small><small>{row.category}</small></td>
    <td>{row.status.replaceAll("_", " ")}{row.included !== undefined ? <small>{row.included ? "Included in numerator" : "Denominator only"}</small> : null}{row.coordinationStatus ? <small>Coordination: {row.coordinationStatus.replaceAll("_", " ")}</small> : null}</td>
    <td><details><summary>View timestamps and evidence</summary><dl><dt>Event / created</dt><dd>{timestamp(row.occurredAt)}</dd>{row.executionStart ? <><dt>Earliest execution start</dt><dd>{timestamp(row.executionStart)}</dd></> : null}{row.responseAt ? <><dt>Response / closed</dt><dd>{timestamp(row.responseAt)}</dd></> : null}{row.uploadedAt ? <><dt>Uploaded</dt><dd>{timestamp(row.uploadedAt)}</dd></> : null}{row.deadline ? <><dt>Deadline</dt><dd>{timestamp(row.deadline)}</dd></> : null}{row.durationHours !== undefined ? <><dt>Duration</dt><dd>{row.durationHours.toFixed(3)} hours</dd></> : null}{row.lengthMeters !== undefined ? <><dt>Affected length</dt><dd>{row.lengthMeters} m</dd></> : null}</dl><p>{row.detail}</p>{row.evidenceIds?.map(id => <small className={styles.recordId} key={id}>Linked record: {id}</small>)}</details></td>
  </tr>)}</tbody></table></div>{limit < rows.length ? <button type="button" className="secondary-link" onClick={() => setLimit(limit + 25)}>Show 25 more records</button> : null}</> : <EmptyState title="No qualifying records" description="No recorded cases contribute to this metric in the selected period." />}</>;
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<InsightsPreset>("last7");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [wardId, setWardId] = useState(""); const [categoryId, setCategoryId] = useState("");
  const [wards, setWards] = useState<WardSummary[]>([]); const [categories, setCategories] = useState<Pick<Category, "id" | "name">[]>([]);
  const [report, setReport] = useState<OperationalAnalyticsReport>();
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<OperationalMetricKey>("conflicts-resolved"); const [evidencePeriod, setEvidencePeriod] = useState<"current" | "previous">("current");
  const evidenceRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([apiFetch<{ wards: WardSummary[] }>("/wards"), apiFetch<{ categories: Category[] }>("/categories")]).then(([w, c]) => { if (active) { setWards(w.wards); setCategories(c.categories); } }).catch(() => { /* Scoped report options remain available. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setReport(undefined); setError(undefined);
    if (preset === "custom" && (!from || !to || from > to)) { setLoading(false); return; }
    const query = new URLSearchParams({ preset });
    if (wardId) query.set("wardId", wardId); if (categoryId) query.set("categoryId", categoryId);
    if (preset === "custom") { query.set("from", from); query.set("to", to); }
    setLoading(true);
    void apiFetch<OperationalAnalyticsReport>(`/analytics/project-head/operations?${query}`).then(value => {
      if (active) { setReport(value); setLoading(false); }
    }).catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : "Could not load Insights"); setLoading(false); } });
    return () => { active = false; };
  }, [preset, from, to, wardId, categoryId, revision]);
  const inspect = (metric: OperationalMetric) => { setSelected(metric.key); setEvidencePeriod("current"); evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); evidenceRef.current?.focus({ preventScroll: true }); };
  const chosen = report?.metrics.find(metric => metric.key === selected);
  const cards = (keys: OperationalMetricKey[]) => <div className={styles.grid}>{keys.map(key => { const metric = report?.metrics.find(m => m.key === key); return metric ? <InsightMetric key={key} metric={metric} onInspect={() => inspect(metric)} /> : null; })}</div>;
  return <div className={styles.insights}>
    <PageHeader title="Insights" description="Measured coordination and delivery outcomes from recorded City Connect workflow data." />
    <section className={styles.filters} aria-label="Insights filters">
      <label>Period<select value={preset} onChange={e => setPreset(e.target.value as InsightsPreset)}><option value="today">Today</option><option value="last7">Last 7 days</option><option value="last30">Last 30 days</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom</option></select></label>
      <label>Ward<select value={wardId} onChange={e => setWardId(e.target.value)}><option value="">Overall · all wards</option>{(wards.length ? wards : report?.options.wards ?? []).map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></label>
      <label>Work type<select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">All work types</option>{(categories.length ? categories : report?.options.categories ?? []).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
      {preset === "custom" ? <><label>From<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label></> : null}
      <button type="button" className="secondary-link" disabled={loading} onClick={() => setRevision(r => r + 1)}>Refresh</button>
    </section>
    {error ? <p className="error" role="alert">{error} <button type="button" onClick={() => setRevision(r => r + 1)}>Retry</button></p> : null}
    {loading ? <div role="status" className={styles.loading}>Calculating recorded outcomes and the previous period…</div> : null}
    {!report && !loading && !error ? <EmptyState title="Choose both custom dates" description="The previous period will have the same number of days. Custom ranges can span up to 366 days." /> : null}
    {report ? <>
      {report.containsDemoRecords ? <aside className={styles.summary}><strong>Demo workflow data included · illustrative outcomes</strong><p>This agency includes explicitly seeded Insights demo records. These figures demonstrate the workflow and are not claims of real-world impact. Demo works and evidence metadata are labeled in the drilldowns.</p></aside> : null}
      <div className={styles.period}><strong>{range(report.periods.current)}</strong><span>{report.periods.label}: {range(report.periods.previous)}</span><small>Agency scope comes from your signed-in account. Bengaluru time · recorded as of {timestamp(report.generatedAt)}.</small>{report.periods.partial ? <small>Current period is still in progress; previous period is complete. Counts reflect different elapsed workloads.</small> : null}</div>
      <section aria-labelledby="primary-performance"><div className={styles.sectionHeading}><span>Operational performance</span><h2 id="primary-performance">Before execution → During coordination → After execution</h2><p>Every rate includes its denominator. Select a measure to inspect its records.</p></div>{cards(primary)}</section>
      <PerformanceSummary metrics={report.metrics} label={report.periods.label} />
      {sections.map(section => <section key={section.title}><div className={styles.sectionHeading}><h2>{section.title}</h2><p>{section.description}</p></div>{cards(section.keys)}</section>)}
      <InsightTrend trend={report.trend} />
      <section className={styles.surface}><h2>Ward / work type performance</h2><p>Same formulas and period comparison within each group. Select a row to filter the report and inspect its evidence.</p>{(["ward", "category"] as const).map(kind => <details key={kind} open={kind === "ward"}><summary>{kind === "ward" ? "Ward outcomes" : "Work type outcomes"}</summary><div className="table-scroll"><table><thead><tr><th>{kind === "ward" ? "Ward" : "Work type"}</th>{["works-coordinated", "conflicts-resolved", "dependency-response-time", "coordination-turnaround", "first-time-completion", "verified-closure", "risks-addressed"].map(key => <th key={key}>{report.metrics.find(m => m.key === key)?.label}</th>)}</tr></thead><tbody>{report.dimensions.filter(d => d.kind === kind).map(d => <tr key={d.id}><th><button className="secondary-link" type="button" onClick={() => kind === "ward" ? setWardId(d.id) : setCategoryId(d.id)}>{d.name}</button></th>{["works-coordinated", "conflicts-resolved", "dependency-response-time", "coordination-turnaround", "first-time-completion", "verified-closure", "risks-addressed"].map(key => { const m = d.metrics.find(m => m.key === key)!; return <td key={key}><strong>{metricValue(m.value, m.unit)}</strong><small>{metricSample(m)}</small><small>Previous: {metricValue(m.previous.value, m.unit)} · {metricSample(m.previous)}</small><small>{metricChange(m)}</small>{m.limitedSample ? <small>Limited sample</small> : null}</td>; })}</tr>)}</tbody></table></div></details>)}</section>
      <SystemValidation benchmark={report.validation} />
      <section className={styles.surface} ref={evidenceRef} tabIndex={-1} aria-labelledby="evidence-heading"><h2 id="evidence-heading">Evidence behind the numbers</h2><div className={styles.filters}><label>Measure<select value={selected} onChange={e => setSelected(e.target.value as OperationalMetricKey)}>{report.metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label><label>Evidence period<select value={evidencePeriod} onChange={e => setEvidencePeriod(e.target.value as "current" | "previous")}><option value="current">Current period</option><option value="previous">Previous period</option></select></label></div><p><strong>Formula: </strong>{chosen?.description}</p><EvidenceRows key={`${selected}:${evidencePeriod}:${report.generatedAt}`} rows={(evidencePeriod === "current" ? report.details : report.previousDetails)[selected]} /></section>
      <details className={styles.surface}><summary>Measurement definitions and limits</summary>{report.notes.map(note => <p key={note}>{note}</p>)}<p>Limited sample means fewer than {report.sampleThreshold} assessed cases or recorded durations. It is a caution about sample size, not a confidence interval.</p></details>
    </> : null}
  </div>;
}
