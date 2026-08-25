"use client";

import { useState } from "react";
import { DependencyTable } from "../_components/dependency-table";

export default function ProjectHeadDependenciesPage() {
  const [direction, setDirection] = useState<"received" | "sent">("received");

  return <div className="project-head-dependencies-page">
    <header className="portal-heading"><div><p className="eyebrow">Agency coordination</p><h1>Dependencies</h1><p>Respond to partner-agency requests or track requests sent from your projects.</p></div></header>
    <div aria-label="Dependency views" className="engineer-work-tabs" role="tablist">
      <button aria-controls="project-head-dependency-results" aria-selected={direction === "received"} className={direction === "received" ? "active" : ""} onClick={() => setDirection("received")} role="tab" type="button">Received</button>
      <button aria-controls="project-head-dependency-results" aria-selected={direction === "sent"} className={direction === "sent" ? "active" : ""} onClick={() => setDirection("sent")} role="tab" type="button">Sent</button>
    </div>
    <div id="project-head-dependency-results" role="tabpanel" tabIndex={0}><DependencyTable direction={direction} key={direction} /></div>
  </div>;
}
