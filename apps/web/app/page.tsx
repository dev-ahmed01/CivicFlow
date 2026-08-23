import { ReportForm } from "./report-form";
import { CitizenHeader } from "./_components/citizen-header";

export default function HomePage() {
  return <main><CitizenHeader /><div className="intro"><p className="eyebrow">Report a civic issue</p><h1>Help Bengaluru work better.</h1><p>Four quick steps. A clear photo and precise location help the right team respond.</p></div><ReportForm /></main>;
}
