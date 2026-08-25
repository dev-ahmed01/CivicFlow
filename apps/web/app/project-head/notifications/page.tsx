"use client";

import { NotificationCenter } from "../../_components/notification-center";
import { apiFetch } from "../_lib/api";

export default function ProjectHeadNotificationsPage() {
  return <NotificationCenter apiFetch={apiFetch} role="PROJECT_HEAD" showFilters variant="portal-inline" />;
}
