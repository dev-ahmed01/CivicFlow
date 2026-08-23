"use client";

import { NotificationBell, NotificationCenter } from "../_components/notification-center";
import { getCitizenAccessToken } from "../_lib/citizen-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function citizenApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getCitizenAccessToken();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

export function CitizenNotificationBell() {
  return <NotificationBell apiFetch={citizenApiFetch} href="/notifications" />;
}

export function CitizenNotificationCenter() {
  return <NotificationCenter apiFetch={citizenApiFetch} role="CITIZEN" showFilters={false} />;
}
