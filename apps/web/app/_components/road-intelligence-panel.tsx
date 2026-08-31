"use client";

import { useState } from "react";
import type { RoadConflict, RoadInterventionHistoryItem, RoadSegmentSummary, SequencingRecommendation, SequencingRecommendationOutcome } from "@civicos/shared";
import { ConflictBanner, SequencingRecommendationCard, StatusChip } from "./ui";

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

function conflictCopy(type: RoadConflict["type"]): { title: string; advice: string } {
  switch (type) {
    case "SPATIAL": return { title: "Same road section", advice: "Coordinate before work starts." };
    case "RESTORATION_TOO_EARLY": return { title: "Restore road later", advice: "Finish utility work before resurfacing." };
    case "SEQUENCING_VIOLATION": return { title: "Work order conflict", advice: "Complete underground work first." };
    case "TEMPORAL": return { title: "Dates overlap", advice: "Coordinate the work dates." };
    case "REPEATED_EXCAVATION_RISK": return { title: "Repeat cutting risk", advice: "Combine work to avoid cutting twice." };
    case "DUPLICATE_INTERVENTION": return { title: "Similar work planned", advice: "Confirm the scope before starting." };
  }
}

export function RoadIntelligencePanel({ data, projectId, plannedStart, plannedEnd, onAction }: Props) {
  const [start, setStart] = useState(dateInput(plannedStart));
  const [end, setEnd] = useState(dateInput(plannedEnd));
  const [busy, setBusy] = useState<string>();
  const [feedback, setFeedback] = useState<{ recommendationId: string; tone: "error" | "success"; message: string }>();
  if (!data.segment) return null;

  const act = async (recommendationId: string, outcome: SequencingRecommendationOutcome) => {
    if (!onAction) return;
    if (outcome !== "DISMISSED" && Boolean(start) !== Boolean(end)) {
      setFeedback({ recommendationId, tone: "error", message: "Choose both a start and end date, or clear both dates." });
      return;
    }
    if (outcome === "MODIFIED" && (!start || !end)) {
      setFeedback({ recommendationId, tone: "error", message: "Choose new start and end dates before updating." });
      return;
    }
    if (outcome !== "DISMISSED" && start && end && end < start) {
      setFeedback({ recommendationId, tone: "error", message: "End date must be on or after the start date." });
      return;
    }
    setFeedback(undefined);
    setBusy(`${recommendationId}:${outcome}`);
    try {
      await onAction(recommendationId, outcome, outcome !== "DISMISSED" && start && end ? { plannedStart: `${start}T00:00:00.000Z`, plannedEnd: `${end}T23:59:59.999Z` } : undefined);
      setFeedback({ recommendationId, tone: "success", message: outcome === "DISMISSED" ? "Current schedule retained." : "Dates updated." });
    } catch (reason) {
      setFeedback({ recommendationId, tone: "error", message: reason instanceof Error ? reason.message : "Could not update this sequence check." });
    } finally {
      setBusy(undefined);
    }
  };

  return <div className="road-intelligence-stack">
    {data.conflicts.length ? <ConflictBanner><h2>{data.conflicts.length} road coordination warning{data.conflicts.length === 1 ? "" : "s"}</h2><p>These rule-based warnings are advisory and never block delivery.</p><div className="conflict-list compact-conflict-list">{data.conflicts.map((conflict) => {
      const copy = conflictCopy(conflict.type);
      return <article className={`conflict-item road-${conflict.severity.toLowerCase().replace("_", "-")}`} key={conflict.id}><div><strong>{copy.title}</strong><StatusChip label={conflict.severity === "MEDIUM_HIGH" ? "Medium" : title(conflict.severity)} tone="warning" /></div><p>{conflict.conflictingAgency?.name ?? "Road record"} · {conflict.segmentName}</p><small>{copy.advice}</small><details><summary>Rule details</summary><p>{conflict.reason}</p></details></article>;
    })}</div></ConflictBanner> : null}

    {data.recommendations.map((recommendation) => <SequencingRecommendationCard key={recommendation.id}>
      <div className="sequencing-heading"><div><span className="ph-operational-label">Road coordination</span><h2>Proposed work sequence</h2></div><StatusChip label={recommendation.latestOutcome ? title(recommendation.latestOutcome) : "Sequence check pending"} tone={recommendation.latestOutcome ? "info" : "warning"} /></div>
      <p className="sequencing-explanation">Underground utility work precedes road restoration.</p>
      <ol className="sequencing-order">{recommendation.proposedOrder.map((item, index) => <li key={`${item.interventionId ?? "restoration"}-${index}`}><span>{index + 1}</span><div><strong>{title(item.purpose)}</strong><small>{item.agencyName} · {new Date(item.plannedStart).toLocaleDateString("en-IN")} - {new Date(item.plannedEnd).toLocaleDateString("en-IN")}</small></div></li>)}</ol>
      <details><summary>Rule details</summary><p className="technical-explanation">{recommendation.explanation}</p><ol className="rule-trace">{recommendation.ruleTrace.map((trace) => <li key={trace.rule}><strong>Rule {trace.rule}</strong> {trace.reason}</li>)}</ol></details>
      {onAction ? <div className="recommendation-actions"><div className="revision-dates"><label>Start date<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>End date<input type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} /></label></div><div><button disabled={Boolean(busy)} type="button" onClick={() => void act(recommendation.id, "ACCEPTED")}>{busy?.endsWith(":ACCEPTED") ? "Applying…" : "Apply dates"}</button><button className="secondary" disabled={Boolean(busy)} type="button" onClick={() => void act(recommendation.id, "MODIFIED")}>{busy?.endsWith(":MODIFIED") ? "Updating…" : "Update dates"}</button><button className="dismiss" disabled={Boolean(busy)} type="button" onClick={() => void act(recommendation.id, "DISMISSED")}>{busy?.endsWith(":DISMISSED") ? "Saving…" : "Keep current schedule"}</button></div>{feedback?.recommendationId === recommendation.id ? <p className={feedback.tone === "error" ? "error recommendation-feedback" : "success recommendation-feedback"} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.message}</p> : null}<small>Every decision is logged and traceable to the rules above.</small></div> : null}
    </SequencingRecommendationCard>)}

    <section className="intervention-history road-history-section"><h2>Road history · {data.segment.roadName}</h2><p>{data.segment.ward.name} · {data.segment.surfaceType}{data.segment.lastRestorationDate ? ` · Last restored ${new Date(data.segment.lastRestorationDate).toLocaleDateString("en-IN")}` : ""}</p><div className="history-list">{data.interventionHistory.map((item) => <article key={item.id}><div><strong>{item.purpose}</strong><span className="state-chip">{title(item.project.state)}</span></div><p>{item.requestingAgency.name} · {new Date(item.plannedStart).toLocaleDateString("en-IN")} - {new Date(item.plannedEnd).toLocaleDateString("en-IN")}</p><small>{item.affectedLengthM}m from chainage {item.startOffsetM}m · Work {item.projectId === projectId ? "this record" : item.project.id.slice(0, 8)}</small></article>)}</div></section>
  </div>;
}
