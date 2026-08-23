import Link from "next/link";
import { CitizenNotificationCenter } from "./citizen-notifications";

export default function CitizenNotificationsPage() {
  return <main><header className="site-header"><Link className="brand" href="/">CivicOS</Link><nav><Link href="/">Report an issue</Link></nav></header><div className="citizen-notification-wrap"><CitizenNotificationCenter /></div></main>;
}
