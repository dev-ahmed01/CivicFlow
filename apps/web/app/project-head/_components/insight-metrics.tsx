import React from "react";
import type { InsightsBenchmark, OperationalMetric } from "@civicos/shared";
import styles from "../reports/insights.module.css";

export const metricValue = (value: number | null, unit: OperationalMetric["unit"]) => value === null ? "—" : `${value.toLocaleString("en-IN")}${unit === "percent" ? "%" : unit === "hours" ? " h" : unit === "meters" ? " m" : ""}`;
export function metricSample(metric: { numerator?: number; denominator?: number; sampleSize?: number }) {
  return metric.denominator !== undefined ? `${metric.numerator} of ${metric.denominator} assessed cases` : `n = ${metric.sampleSize ?? 0} records`;
}
export function metricChange(m: OperationalMetric) {
  const c = m.comparison;
  if (c.change === null) return "No previous-period comparison available";
  if (m.direction === "context") return c.change === 0 ? "No count change" : `${Math.abs(c.change)} ${c.change < 0 ? "fewer" : "more"}${m.unit === "meters" ? " metres" : " records"}`;
  if (m.unit === "percent") return `${c.change > 0 ? "+" : ""}${c.change} percentage points · ${c.interpretation}`;
  if (c.change === 0) return "Unchanged";
  if (c.relativePercent !== null) return `${Math.abs(c.relativePercent)}% ${c.relativePercent > 0 ? "faster" : "slower"} than previous period`;
  return `${Math.abs(c.change)} h ${c.change > 0 ? "slower" : "faster"} · no relative comparison from a zero baseline`;
}
export function InsightMetric({ metric: m, onInspect }: { metric: OperationalMetric; onInspect: () => void }) {
  return <button type="button" className={styles.metric} onClick={onInspect} aria-label={`${m.label}: ${metricValue(m.value, m.unit)}. View evidence`}>
    <span className={styles.metricLabel}>{m.label}</span><strong className={styles.value}>{metricValue(m.value, m.unit)}</strong>
    <span>{m.value === null ? "No recorded cases in this period" : metricSample(m)}</span>
    {m.limitedSample && m.direction !== "context" ? <span className={styles.limited}>Limited sample</span> : <span className={styles.sampleSpace} />}
    <span className={styles.previous}>Previous: {metricValue(m.previous.value, m.unit)}<small>{metricSample(m.previous)}</small></span>
    <span className={m.direction === "context" ? styles.neutral : m.comparison.interpretation === "Improved" ? styles.improved : m.comparison.interpretation === "Declined" ? styles.declined : styles.neutral}>{metricChange(m)}</span>
    {m.unit === "hours" ? <small>Lower response time is better</small> : null}<span className={styles.inspect}>View evidence ↗</span>
  </button>;
}
export function PerformanceSummary({ metrics, label }: { metrics: OperationalMetric[]; label: string }) {
  const performance = metrics.filter(m => m.direction !== "context");
  const counts = (status: string) => performance.filter(m => m.comparison.interpretation === status).length;
  // Rates and durations have different units: never rank percentage points against relative time reductions.
  const rateGain = performance.filter(m => m.unit === "percent" && m.comparison.interpretation === "Improved").sort((a, b) => Math.abs(b.comparison.change!) - Math.abs(a.comparison.change!))[0];
  const timeGain = performance.filter(m => m.unit === "hours" && (m.comparison.relativePercent ?? 0) > 0).sort((a, b) => b.comparison.relativePercent! - a.comparison.relativePercent!)[0];
  const declines = performance.filter(m => m.comparison.interpretation === "Declined");
  return <aside className={styles.summary}><h2>Performance {label}</h2><p><strong>{counts("Improved")} improved</strong><span>{counts("Unchanged")} unchanged</span><span>{counts("Declined")} declined</span><span>{counts("No comparable data")} without a comparable baseline</span></p>
    {rateGain ? <div>Largest rate improvement: <strong>{rateGain.label}</strong> · {metricChange(rateGain)}</div> : null}{timeGain ? <div>Largest time reduction: <strong>{timeGain.label}</strong> · {metricChange(timeGain)}</div> : null}
    {declines.length ? <div>Needs attention: {declines.map(m => `${m.label} (${metricChange(m)})`).join("; ")}</div> : null}<small>Independent measures; sample sizes appear on the cards. Activity counts are excluded. No overall score is calculated.</small>
  </aside>;
}
export function SystemValidation({ benchmark }: { benchmark: InsightsBenchmark | null }) {
  const rate = (n: number, d: number) => d ? `${Math.round(n / d * 1000) / 10}% (${n}/${d})` : "— (no assessable cases)";
  return <section className={styles.surface}><div className={styles.sectionHeading}><span>Controlled benchmark · separate from operational performance</span><h2>System validation</h2><p>Known test scenarios measure technical correctness. These results do not measure live coordination outcomes.</p></div>
    {benchmark ? <><p>Run: {new Date(benchmark.generatedAt).toLocaleString("en-IN")} · suite v{benchmark.version} · revision {benchmark.revision}</p><div className={styles.validationGrid}>{benchmark.suites.map(suite => <details key={suite.name}><summary>{suite.name} · {suite.correct} / {suite.total} scenarios correct</summary><p>{suite.scope}</p>{suite.confusion ? <p>Precision: {rate(suite.confusion.tp, suite.confusion.tp + suite.confusion.fp)}<br />Recall: {rate(suite.confusion.tp, suite.confusion.tp + suite.confusion.fn)}<br />Accuracy: {rate(suite.correct, suite.total)}<br />TP {suite.confusion.tp} · FP {suite.confusion.fp} · TN {suite.confusion.tn} · FN {suite.confusion.fn}</p> : null}<ul>{suite.cases.map(c => <li key={c.name}>{c.passed ? "Pass" : "Fail"} · {c.name}<small>Expected: {c.expected}<br />Actual: {c.actual}</small></li>)}</ul></details>)}</div></> : <p>Validation benchmark not run. Conflict detection, agency routing, road sequencing and spatial-resolution results will appear after a versioned benchmark is available.</p>}
  </section>;
}
