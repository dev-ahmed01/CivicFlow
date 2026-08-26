"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CitizenNotificationBell } from "../notifications/citizen-notifications";
import { logoutCitizen } from "../_lib/citizen-auth";
import { CitizenIcon } from "./ui";

function CitizenBrand() {
  return <Link aria-label="CityConnect home" className="cf-brand" href="/"><span className="cf-logo-mark" aria-hidden="true">C<span>•</span></span><span><strong>CITY</strong><b>CONNECT</b></span></Link>;
}

export function CitizenHeader({ variant = "authenticated" }: { variant?: "public" | "authenticated" }) {
  const pathname = usePathname();
  const router = useRouter();
  const reportActive = pathname === "/" || pathname === "/report";
  return <header className={`cf-header ${variant === "public" ? "cf-header-public" : ""}`}>
    <CitizenBrand />
    {variant === "public" ? <p className="cf-public-tagline"><CitizenIcon name="shield" size={25} />One City. One Workflow. <strong>Complete Accountability.</strong></p> : <>
      <nav aria-label="Citizen navigation"><Link className={reportActive ? "active" : ""} href="/">Report</Link><Link className={pathname.startsWith("/tickets") ? "active" : ""} href="/tickets">My Tickets</Link></nav>
      <div className="cf-header-actions"><CitizenNotificationBell /><button className="cf-logout" onClick={() => void logoutCitizen().finally(() => router.replace("/login"))} type="button">Logout<CitizenIcon name="logout" size={25} /></button></div>
    </>}
  </header>;
}
