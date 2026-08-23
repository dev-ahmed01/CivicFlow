import { CitizenNotificationCenter } from "./citizen-notifications";
import { CitizenHeader } from "../_components/citizen-header";

export default function CitizenNotificationsPage() {
  return <main><CitizenHeader /><div className="citizen-notification-wrap"><CitizenNotificationCenter /></div></main>;
}
