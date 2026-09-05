import Link from "next/link";
import type { ReactNode } from "react";
import type { DependencyListItem } from "@civicos/shared";
import { PortalStatePill } from "../../_components/ui";

const date = (value: string | Date) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export function EngineerDependencyCard({ dependency, direction, projectHref, children }: {
  dependency: DependencyListItem;
  direction: "received" | "sent";
  projectHref: string;
  children: ReactNode;
}) {
  const partner = direction === "received" ? dependency.requestingAgency : dependency.respondingAgency;
  return <article className="engineer-connected-card">
    <aside className="engineer-connected-state"><PortalStatePill state={dependency.state} /></aside>
    <div className="engineer-connected-body">
      <h2>{dependency.project.ticket?.title ?? "Agency coordination"}</h2>
      <div className="engineer-connected-agencies">
        <div><small>Primary agency</small><strong>{dependency.requestingAgency.name}</strong></div>
        <span aria-hidden="true">⇄</span>
        <div><small>Dependency agency</small><strong>{dependency.respondingAgency.name}</strong></div>
        <div><small>Connected on</small><strong>{date(dependency.createdAt)}</strong></div>
        <div><small>Last response</small><strong>{dependency.respondedAt ? date(dependency.respondedAt) : "Awaiting response"}</strong></div>
      </div>
      <p className="engineer-connected-requirement"><small>Requirement</small>{dependency.requirement}</p>
      <dl className="engineer-connected-meta">
        <div><dt>Deadline</dt><dd>{date(dependency.deadline)}</dd></div>
        <div><dt>Assigned engineer</dt><dd>{dependency.assignedEngineer?.email ?? "Awaiting assignment"}</dd></div>
        <div><dt>Grievance</dt><dd>{dependency.grievance?.status.replaceAll("_", " ") ?? "None"}</dd></div>
        <div><dt>Connected by</dt><dd>{dependency.requestingAgency.name}</dd></div>
      </dl>
      <footer><details><summary>View connected agency</summary><p><strong>{partner.name}</strong><br />{partner.type}</p>{dependency.contacts.map((contact) => <p key={contact.email}>{contact.email}</p>)}</details><Link href={projectHref}>View connected project &rarr;</Link></footer>
      <div className="dependency-flow-actions">{children}</div>
    </div>
  </article>;
}
