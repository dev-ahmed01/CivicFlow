"use client";

import { NotificationBell, NotificationCenter } from "../_components/notification-center";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const accessToken = process.env.NEXT_PUBLIC_ACCESS_TOKEN ?? "";

async function citizenApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
