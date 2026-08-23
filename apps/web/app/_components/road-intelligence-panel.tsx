"use client";

import { useState } from "react";
import type { RoadConflict, RoadInterventionHistoryItem, RoadSegmentSummary, SequencingRecommendation, SequencingRecommendationOutcome } from "@civicos/shared";

export type RoadIntelligenceData = {
  conflicts: RoadConflict[];
  recommendations: SequencingRecommendation[];
  segment: RoadSegmentSummary | null;
  interventionHistory: RoadInterventionHistoryItem[];
};

type Props = {
  data: RoadIntelligenceData;
  projectId: string;
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  onAction?: (recommendationId: string, outcome: SequencingRecommendationOutcome, revision?: { plannedStart: string; plannedEnd: string }) => Promise<void>;
};

function dateInput(value: Date | string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function title(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function RoadIntelligencePanel({ data, projectId, plannedStart, plannedEnd, onAction }: Props) {
  const [start, setStart] = useState(dateInput(plannedStart));
  const [end, setEnd] = useState(dateInput(plannedEnd));
  const [busy, setBusy] = useState<string>();
  if (!data.segment) return null;

  const act = async (recommendationId: string, outcome: SequencingRecommendationOutcome) => {
    if (!onAction) return;
    setBusy(`${recommendationId}:${outcome}`);
    try {
      await onAction(recommendationId, outcome, outcome !== "DISMISSED" && start && end ? { plannedStart: `${start}T00:00:00.000Z`, plannedEnd: `${end}T23:59:59.999Z` } : undefined);
    } finally {
      setBusy(undefined);
    }
  };

  return <div className="road-intelligence-stack">
    {data.conflicts.length ? <section className="portal-panel conflict-panel road-conflict-panel"><p className="eyebrow">Road-specific advisory check</p><h2>{data.conflicts.length} Road-Cutting warning{data.conflicts.length === 1 ? "" : "s"}</h2><p>Exact-segment checks run after the generic engine. Continue Anyway remains available.</p><div className="conflict-list">{data.conflicts.map((conflict) => <article className={`conflict-item road-${conflict.severity.toLowerCase().replace("_", "-")}`} key={conflict.id}><div><strong>{title(conflict.type)}</strong><span className="conflict-severity">{title(conflict.severity)}</span></div><p>{conflict.segmentName}{conflict.conflictingAgency ? ` · ${conflict.conflictingAgency.name}` : " · Single-record risk"}</p><small>{conflict.reason}</small></article>)}</div></section> : null}
    {data.recommendations.map((recommendation) => <section className="portal-panel sequencing-card" key={recommendation.id}><div className="sequencing-heading"><div><p className="eyebrow">Sequencing Recommendation · Advisory</p><h2>Explainable work order</h2></div>{recommendation.latestOutcome ? <span className="state-chip">{title(recommendation.latestOutcome)}</span> : <span className="state-chip due">Pending review</span>}</div><p className="sequencing-explanation">{recommendation.explanation}</p><ol className="sequencing-order">{recommendation.proposedOrder.map((item, index) => <li key={`${item.interventionId ?? "restoration"}-${index}`}><span>{index + 1}</span><div><strong>{item.purpose}</strong><small>{item.agencyName} · {new Date(item.plannedStart).toLocaleDateString("en-IN")} – {new Date(item.plannedEnd).toLocaleDateString("en-IN")}</small></div></li>)}</ol><details><summary>Why this order?</summary><ol className="rule-trace">{recommendation.ruleTrace.map((trace) => <li key={trace.rule}><strong>Rule {trace.rule}</strong> {trace.reason}</li>)}</ol></details>{onAction ? <div className="recommendation-actions"><div className="revision-dates"><label>Revised start<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Revised end<input type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></label></div><div><button disabled={Boolean(busy)} type="button" onClick={() => void act(recommendation.id, "ACCEPTED")}>Accept{start && end ? " with dates" : ""}</button><button className="secondary" disabled={Boolean(busy)} type="button" onClick={() => void act(recommendation.id, "MODIFIED")}>Modify</button><button className="dismiss" disabled={Boolean(busy)} type="button" onClick={() => void act(recommendation.id, "DISMISSED")}>Dismiss</button></div><small>Every action is logged. Dismissal never deletes the recommendation.</small></div> : null}</section>)}
    <section className="portal-panel intervention-history"><p className="eyebrow">Derived intervention history</p><h2>{data.segment.roadName}</h2><p>{data.segment.ward.name} · {data.segment.surfaceType}{data.segment.lastRestorationDate ? ` · Last restored ${new Date(data.segment.lastRestorationDate).toLocaleDateString("en-IN")}` : ""}</p><div className="history-list">{data.interventionHistory.map((item) => <article key={item.id}><div><strong>{item.purpose}</strong><span className="state-chip">{title(item.project.state)}</span></div><p>{item.requestingAgency.name} · {new Date(item.plannedStart).toLocaleDateString("en-IN")} – {new Date(item.plannedEnd).toLocaleDateString("en-IN")}</p><small>{item.affectedLengthM}m from chainage {item.startOffsetM}m · Project {item.projectId === projectId ? "this project" : item.project.id.slice(0, 8)}</small></article>)}</div></section>
  </div>;
}
