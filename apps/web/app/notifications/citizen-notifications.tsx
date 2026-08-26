"use client";

import { NotificationBell, NotificationCenter } from "../_components/notification-center";
import { citizenApiFetch } from "../_lib/citizen-auth";

export function CitizenNotificationBell() {
  return <NotificationBell apiFetch={citizenApiFetch} href="/notifications" />;
}

export function CitizenNotificationCenter() {
  return <NotificationCenter apiFetch={citizenApiFetch} role="CITIZEN" showFilters={false} variant="citizen" />;
}
