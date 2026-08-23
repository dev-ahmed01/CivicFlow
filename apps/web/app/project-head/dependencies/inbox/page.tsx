import { DependencyTable } from "../../_components/dependency-table";

export default function DependencyInboxPage() {
  return <><header className="portal-heading"><div><p className="eyebrow">W-P7 · Received</p><h1>Dependency inbox</h1><p>Requests awaiting coordination from your agency.</p></div></header><DependencyTable direction="received" /></>;
}
