"use client";

import type { DependencyListItem, ProjectListItem } from "@civicos/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { PortalStatePill } from "./ui";

function deadlineText(deadline: string | Date): string {
  const difference = new Date(deadline).getTime() - Date.now();
  const days = Math.max(1, Math.ceil(Math.abs(difference) / 86_400_000));
  return difference >= 0 ? `${days} ${days === 1 ? "day" : "days"} left` : `Overdue by ${days} ${days === 1 ? "day" : "days"}`;
}

export function NextActionButton({ children, href, onClick, busy = false, secondary = false }: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  busy?: boolean;
  secondary?: boolean;
}) {
  const className = `next-action-button ${secondary ? "secondary" : "primary"}`;
  if (href) return <Link className={className} href={href}>{children}<span aria-hidden="true">→</span></Link>;
  return <button className={className} disabled={busy} onClick={onClick} type="button">{busy ? "Working…" : children}<span aria-hidden="true">→</span></button>;
}

export function ProjectActionCard({ project, action, children }: {
  project: ProjectListItem & { editable?: boolean };
  action: ReactNode;
  children?: ReactNode;
}) {
  return <article className="project-action-card">
    <header><div><p className="eyebrow">Project {project.id.slice(0, 8)}</p><h2>{project.ticket?.title ?? "Standalone project"}</h2></div><PortalStatePill state={project.state} /></header>
    <dl><div><dt>Agency</dt><dd>{project.agency.name}</dd></div><div><dt>Responsible</dt><dd>{project.action?.responsibleUser.email ?? project.engineer?.email ?? "Not assigned"}</dd></div><div><dt>Ward</dt><dd>{project.ticket?.ward.name ?? "—"}</dd></div><div><dt>Dependencies</dt><dd>{project.dependencyCount > 0 ? `${project.dependencyCount} linked` : "None"}</dd></div><div><dt>Grievance</dt><dd>{project.grievance ? project.grievance.status.replaceAll("_", " ") : "None"}</dd></div></dl>
    <footer><div className="project-next-actions">{action}{children}</div><span suppressHydrationWarning className={project.action && new Date(project.action.deadline).getTime() < Date.now() ? "deadline-overdue" : ""}>{project.action ? deadlineText(project.action.deadline) : project.plannedEnd ? `Execution due ${new Date(project.plannedEnd).toLocaleDateString("en-IN")}` : "Timeline pending"}</span></footer>
  </article>;
}

export function ConflictIndicator({ count, href }: { count: number; href?: string }) {
  const content = <><span aria-hidden="true">!</span><strong>{count}</strong><small>{count === 1 ? "advisory warning" : "advisory warnings"}</small></>;
  return href ? <Link className={`conflict-indicator ${count > 0 ? "active" : "clear"}`} href={href}>{content}</Link> : <div className={`conflict-indicator ${count > 0 ? "active" : "clear"}`}>{content}</div>;
}

export function DependencyFlowCard({ dependency, direction, projectHref, children }: {
  dependency: DependencyListItem;
  direction: "sent" | "received";
  projectHref?: string;
  children?: ReactNode;
}) {
  const connectedAgency = direction === "sent" ? dependency.respondingAgency : dependency.requestingAgency;
  return <article className={`dependency-flow-card ${dependency.state === "ESCALATED" ? "escalated" : ""}`}>
    <header><div><p className="eyebrow">Connected work</p><h2>{dependency.project.ticket?.title ?? "Agency coordination"}</h2></div><PortalStatePill state={dependency.state} /></header>
    <div className="dependency-connection" aria-label={`${dependency.requestingAgency.name} connected to ${dependency.respondingAgency.name}`}>
      <div><small>Primary agency</small><strong>{dependency.requestingAgency.name}</strong></div><span aria-hidden="true">↔</span><div><small>Dependency agency</small><strong>{dependency.respondingAgency.name}</strong></div>
    </div>
    <p className="dependency-requirement"><strong>Requirement</strong>{dependency.requirement}</p>
    <dl className="dependency-flow-meta"><div><dt>Connected agency</dt><dd>{connectedAgency.name}</dd></div><div><dt>Deadline</dt><dd suppressHydrationWarning>{deadlineText(dependency.deadline)}</dd></div><div><dt>Assigned engineer</dt><dd>{dependency.assignedEngineer?.email ?? dependency.action?.responsibleUser.email ?? "Awaiting assignment"}</dd></div><div><dt>Grievance</dt><dd>{dependency.grievance ? dependency.grievance.status.replaceAll("_", " ") : dependency.escalatedAt ? `Escalated ${new Date(dependency.escalatedAt).toLocaleDateString("en-IN")}` : "None"}</dd></div></dl>
    <details className="connected-agency-details"><summary>View Connected Agency</summary><p><strong>{connectedAgency.name}</strong><span>{connectedAgency.type}</span></p></details>
    <footer>{projectHref ? <Link className="connected-project-link" href={projectHref}>View connected project →</Link> : <span className="connected-project-reference">Project {dependency.project.id.slice(0, 8)}</span>}{children ? <div className="dependency-flow-actions">{children}</div> : null}</footer>
  </article>;
}
