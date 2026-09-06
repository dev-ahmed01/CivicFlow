import type { MetricRow } from "@civicos/shared";
import { EmptyState } from "../../_components/ui";

export function VolumeChart({ title, rows }: { title: string; rows: MetricRow[] }) {
  const maximum = Math.max(1, ...rows.map((row) => row.total ?? 0));
  return <section className="ph-surface ph-chart"><h2>{title}</h2>{rows.length ? <div className="ph-volume-chart" role="list" aria-label={title}>{rows.map((row) => <div role="listitem" key={row.dimension} className="ph-chart-bar" title={`${row.dimension}: ${row.total ?? 0} tickets, ${row.count ?? 0} resolved`}><strong>{row.total ?? 0}</strong><svg role="img" aria-label={`${row.dimension}: ${row.total ?? 0} tickets`} viewBox="0 0 60 160" preserveAspectRatio="none"><rect x="4" y={160 - (row.total ?? 0) / maximum * 150} width="52" height={(row.total ?? 0) / maximum * 150} rx="2" fill="currentColor" /></svg><span>{row.dimension}</span></div>)}</div> : <EmptyState title="No ticket volume recorded" description="Try a wider reporting period." />}</section>;
}

export function ResolutionChart({ total, resolved }: { total: number; resolved: number }) {
  const unresolved = Math.max(0, total - resolved);
  const ratio = total ? resolved / total : 0;
  return <section className="ph-surface ph-chart"><h2>Ticket resolution</h2>{total ? <div className="ph-resolution-chart"><svg viewBox="0 0 200 200" role="img" aria-label={`${total} tickets: ${resolved} resolved, ${unresolved} not yet resolved`}><circle cx="100" cy="100" r="72" fill="none" stroke="#d8e9e1" strokeWidth="30" /><circle cx="100" cy="100" r="72" fill="none" stroke="#19865d" strokeWidth="30" pathLength="100" strokeDasharray={`${ratio * 100} 100`} transform="rotate(-90 100 100)" /><text x="100" y="99" textAnchor="middle" className="ph-donut-total">{total}</text><text x="100" y="121" textAnchor="middle" className="ph-donut-label">Total tickets</text></svg><dl><div><dt><i />Resolved</dt><dd>{resolved}</dd></div><div><dt><i />Not yet resolved</dt><dd>{unresolved}</dd></div></dl></div> : <EmptyState title="No tickets in this period" description="Resolution distribution appears when records are available." />}</section>;
}
