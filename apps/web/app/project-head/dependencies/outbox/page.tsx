import { DependencyTable } from "../../_components/dependency-table";

export default function DependencyOutboxPage() {
  return <><header className="portal-heading"><div><p className="eyebrow">W-P8 · Sent</p><h1>Dependency outbox</h1><p>Track responses, deadlines, and escalations for requests your agency sent.</p></div></header><DependencyTable direction="sent" /></>;
}
