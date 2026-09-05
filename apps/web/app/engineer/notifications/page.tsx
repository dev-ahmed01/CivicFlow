"use client";

import { EngineerTip } from "../_components/engineer-ui";
import { NotificationCenter } from "../../_components/notification-center";
import { apiFetch } from "../_lib/api";

export default function EngineerNotificationsPage() {
  return <><NotificationCenter apiFetch={apiFetch} role="ENGINEER" showFilters variant="portal-inline" /><EngineerTip>Explore by category or use filters to find what matters most.<br />Stay on top of updates and keep your projects moving.</EngineerTip></>;
}
