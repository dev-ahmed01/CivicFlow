import Link from "next/link";
import { ReportForm } from "./report-form";

export default function HomePage() {
  return <main><header className="site-header"><Link className="brand" href="/">CivicOS</Link><nav><Link href="/verify">Nearby verification</Link><span>Citizen reporting</span></nav></header><div className="intro"><p className="eyebrow">Report a civic issue</p><h1>Help Bengaluru work better.</h1><p>Four quick steps. A clear photo and precise location help the right team respond.</p></div><ReportForm /></main>;
}
