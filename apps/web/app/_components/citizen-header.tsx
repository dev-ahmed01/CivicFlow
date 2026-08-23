import Link from "next/link";
import { CitizenNotificationBell } from "../notifications/citizen-notifications";

export function CitizenHeader() {
  return <header className="site-header"><Link className="brand" href="/">CivicOS</Link><nav aria-label="Citizen navigation"><Link href="/#report-category">Report</Link><Link href="/tickets">My tickets</Link><Link href="/verify">Verify nearby</Link><Link href="/transparency">City transparency</Link><Link href="/profile">Profile</Link><CitizenNotificationBell /></nav></header>;
}
