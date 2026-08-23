import type { Metadata } from "next";
import Link from "next/link";
import { VerificationPanel } from "./verification-panel";

export const metadata: Metadata = { title: "Nearby verification | CivicOS" };

export default function VerificationPage() {
  return <main><header className="site-header"><Link className="brand" href="/">CivicOS</Link><span>Community verification</span></header><VerificationPanel /></main>;
}
