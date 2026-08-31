"use client";

import { useCallback, useState } from "react";
import type { AnalyticsReport, MetricRow } from "@civicos/shared";
import { EmptyState, PageHeader } from "../../_components/ui";
import { apiFetch } from "../_lib/api";

function ReportTable({ title, rows }: { title: string; rows: MetricRow[] }) {
  return <section className="report-section"><h2>{title}</h2>{rows.length ? <div className="table-scroll"><table><thead><tr><th>Measure</th><th>Breakdown</th><th>Count</th><th>Rate</th><th>Average hours</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.dimension}:${row.secondaryDimension ?? ""}:${index}`}><td>{row.dimension}</td><td>{row.secondaryDimension ?? "—"}</td><td>{row.count ?? row.total ?? "—"}</td><td>{row.ratePercent === undefined ? "—" : `${row.ratePercent}%`}</td><td>{row.averageHours ?? "—"}</td></tr>)}</tbody></table></div> : <EmptyState title="No matching data" description="Try a wider reporting period." />}</section>;
}

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<AnalyticsReport>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      setReport(await apiFetch<AnalyticsReport>(`/analytics/project-head?${query.toString()}`));
      setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load agency reports"); }
    finally { setLoading(false); }
  }, [from, to]);

  return <>
    <PageHeader title="Insights" description="Measured agency delivery outcomes calculated from operational records." />
    <section className="filter-bar report-filters" aria-label="Report period"><label>From<input type="date" max={to || undefined} value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="portal-primary-button" onClick={() => void load()} type="button">Run report</button></section>
    {error ? <p className="error" role="alert">{error}</p> : null}{loading ? <p className="portal-muted" role="status">Calculating report…</p> : null}
    {!report && !loading ? <EmptyState title="Choose a reporting period" description="Run the report to view measured agency outcomes. No narrative or simulated metrics are generated." /> : null}
    {report ? <div className="reports-layout"><section className="report-summary" aria-label="Agency report summary"><div><span>Tickets created</span><strong>{report.totals.ticketsCreated}</strong></div><div><span>Tickets resolved</span><strong>{report.totals.ticketsResolved}</strong></div><div><span>Resolution rate</span><strong>{report.totals.resolutionRatePercent}%</strong></div><div><span>Advisory road conflicts</span><strong>{report.totals.roadConflicts}</strong></div></section><ReportTable title="Resolution by category and agency" rows={report.resolutionTimeByCategoryAgency} /><ReportTable title="Dependency response" rows={report.dependencyResponseByAgency} /><ReportTable title="Citizen closure feedback" rows={report.citizenNotResolvedByAgency} /><ReportTable title="Sequencing outcomes" rows={report.sequencingOutcomesByAgency} /></div> : null}
  </>;
}
