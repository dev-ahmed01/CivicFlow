import { ReportForm } from "./report-form";

export default function HomePage() {
  return <main><header className="site-header"><a className="brand" href="#">CivicOS</a><span>Citizen reporting</span></header><div className="intro"><p className="eyebrow">Report a civic issue</p><h1>Help Bengaluru work better.</h1><p>Four quick steps. A clear photo and precise location help the right team respond.</p></div><ReportForm /></main>;
}
