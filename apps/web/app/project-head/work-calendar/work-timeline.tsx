"use client";

import React from "react";
import type { CivicWorkCalendarItem, CivicWorkPeriod } from "@civicos/shared";

const sections: Array<{ period: CivicWorkPeriod; title: string; description: string }> = [
  { period: "CURRENT", title: "Happening now", description: "Work whose scheduled window includes today" },
  { period: "FUTURE", title: "Upcoming", description: "Approved and planned work ahead" },
  { period: "PAST", title: "Past work", description: "Completed, cancelled, or elapsed work" },
];

function dateRange(work: CivicWorkCalendarItem): string {
  if (!work.plannedStart || !work.plannedEnd) return "Timeline pending";
  const start = new Date(work.plannedStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const end = new Date(work.plannedEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${start} – ${end}`;
}

export function WorkTimeline({ works, selectedId, onSelect }: { works: CivicWorkCalendarItem[]; selectedId?: string; onSelect: (id: string) => void }) {
  return <div className="work-timeline" aria-label="Civic works timeline">
    {sections.map((section) => {
      const items = works.filter(({ period }) => period === section.period);
      return <section className="work-timeline-section" key={section.period}>
        <header><div><span data-period={section.period.toLowerCase()}>{section.title}</span><p>{section.description}</p></div><strong>{items.length}</strong></header>
        {items.length > 0 ? <div className="work-timeline-table" role="table">
          <div className="work-timeline-columns" role="row"><span role="columnheader">Work</span><span role="columnheader">Agency & location</span><span role="columnheader">Timing</span><span role="columnheader">Status / coordination</span></div>
          {items.map((work) => <button aria-pressed={selectedId === work.id} className="work-timeline-row" key={work.id} onClick={() => onSelect(work.id)} role="row" type="button">
            <span className="work-timeline-title" role="cell"><strong>{work.title}</strong><code>{work.referenceNumber}</code></span>
            <span role="cell"><strong>{work.agency.name}</strong><small>{work.locationLabel ?? work.roadSegment?.roadName ?? work.ward?.name ?? "Mapped location"}</small></span>
            <span role="cell"><strong>{dateRange(work)}</strong><small>{work.category?.name ?? "Civic work"}</small></span>
            <span role="cell"><strong>{work.state.replaceAll("_", " ").toLowerCase()}</strong><small>{work.dependencySummary.open > 0 ? `${work.dependencySummary.open} open dependencies` : "No open dependencies"}{work.conflictCount + work.roadConflictCount > 0 ? ` · ${work.conflictCount + work.roadConflictCount} advisory` : ""}</small></span>
          </button>)}
        </div> : <p className="work-timeline-none">No {section.title.toLowerCase()} in this filtered view.</p>}
      </section>;
    })}
  </div>;
}
