"use client";

import { apiUrl, fetchApiJson, redirectToCurrentPortalLogin } from "../../_lib/api";

const sessionKey = "civicos.admin.session.v1";

export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
};

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(sessionKey);
  if (!stored) return null;
  try { return JSON.parse(stored) as AdminSession; }
  catch { window.localStorage.removeItem(sessionKey); return null; }
}

export function saveAdminSession(session: AdminSession): void {
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearAdminSession(): void {
  window.localStorage.removeItem(sessionKey);
}

export async function adminApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminSession()?.accessToken;
  const { response, body } = await fetchApiJson<T & { code?: string }>(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!response.ok) {
    if (response.status === 401 && body.code !== "TOTP_REQUIRED" && path !== "/auth/internal/login") {
      clearAdminSession();
      redirectToCurrentPortalLogin();
    }
    throw new ApiError(body.error ?? "Request failed", body.code);
  }
  return body;
}

export async function downloadAdminExport(path: string, fileName: string): Promise<void> {
  const token = getAdminSession()?.accessToken;
  const response = await fetch(`${apiUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!response.ok) throw new Error("Export failed");
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
