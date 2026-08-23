"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicDashboard } from "@civicos/shared";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function TransparencyPage() {
  const [data, setData] = useState<PublicDashboard>();
  const [error, setError] = useState<string>();
  useEffect(() => { void fetch(`${apiUrl}/analytics/public-dashboard`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error("Public statistics are temporarily unavailable"); return response.json() as Promise<PublicDashboard>; }).then(setData).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load public statistics")); }, []);
  return <main className="transparency-page">
    <header className="transparency-hero"><nav><Link className="portal-brand" href="/"><span>C</span>CivicOS</Link><Link href="/">Report an issue</Link></nav><div><p className="eyebrow">Open civic performance</p><h1>Bengaluru, in the clear.</h1><p>Aggregated city outcomes from report to resolution. No login, no personal data, no individual ticket details.</p></div></header>
    <div className="transparency-content">{error ? <p className="error" role="alert">{error}</p> : null}{!data && !error ? <p>Loading city-wide statistics…</p> : null}{data ? <>
      <section className="privacy-banner"><strong>Privacy by design</strong><span>{data.privacyNotice}</span></section>
      <section className="public-totals"><article><span>Tickets created</span><strong>{data.totals.ticketsCreated}</strong></article><article><span>Tickets resolved</span><strong>{data.totals.ticketsResolved}</strong><small>{data.totals.resolutionRatePercent}% resolution rate</small></article><article><span>Road conflicts detected</span><strong>{data.totals.roadConflicts}</strong><small>advisory warnings</small></article><article className="simulated-metric"><span>Estimated restoration cost saved</span><strong>₹{data.roadMetrics.simulatedRestorationCostSaved.amountInr.toLocaleString("en-IN")}</strong><small>{data.roadMetrics.simulatedRestorationCostSaved.label}</small></article></section>
      <section className="public-grid"><article><h2>Category breakdown</h2><div className="public-ranking">{data.categoryBreakdown.map((item) => <div key={item.dimension}><span>{item.dimension}</span><strong>{item.count ?? 0} / {item.total ?? 0} resolved</strong></div>)}</div></article><article><h2>Agency performance</h2><div className="public-ranking">{data.agencyPerformance.map((item) => <div key={item.agencyId}><span>{item.agency}</span><strong>{item.resolutionRatePercent}% resolved</strong><small>{item.averageResolutionHours === null ? "No resolved-time sample" : `${item.averageResolutionHours} avg. hours`}</small></div>)}</div></article></section>
      <section className="simulation-note"><strong>{data.roadMetrics.simulatedRestorationCostSaved.label}</strong><p>{data.roadMetrics.simulatedRestorationCostSaved.formula}</p><small>This estimate is a scenario calculation, not measured financial savings.</small></section>
      <p className="generated-at">Updated {new Date(data.generatedAt).toLocaleString("en-IN")}</p>
    </> : null}</div>
  </main>;
}
