import { CitizenNotificationCenter } from "./citizen-notifications";
import { CitizenHeader } from "../_components/citizen-header";

export default function CitizenNotificationsPage() {
  return <main className="citizen-shell cf-notifications-shell"><CitizenHeader /><div className="citizen-notification-wrap"><CitizenNotificationCenter /></div></main>;
}
