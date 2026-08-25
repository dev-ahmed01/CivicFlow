import type { Metadata } from "next";
import { VerificationPanel } from "./verification-panel";
import { CitizenHeader } from "../_components/citizen-header";
import Link from "next/link";

export const metadata: Metadata = { title: "Nearby verification | CivicOS" };

export default function VerificationPage() {
  return <main className="citizen-shell"><CitizenHeader /><div className="verification-switch"><span>Review nearby issue reports here.</span><Link className="secondary-link" href="/completion-verification">Verify completed work</Link></div><VerificationPanel /></main>;
}
