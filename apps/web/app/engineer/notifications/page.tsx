"use client";

import { NotificationCenter } from "../../_components/notification-center";
import { apiFetch } from "../_lib/api";

export default function EngineerNotificationsPage() {
  return <NotificationCenter apiFetch={apiFetch} role="ENGINEER" showFilters />;
}
