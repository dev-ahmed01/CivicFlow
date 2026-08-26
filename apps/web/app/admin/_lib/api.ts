"use client";

import { ApiRequestError, authenticatedApiRequest, authenticatedRawRequest, fetchApiJson, redirectToCurrentPortalLogin, revokeSession } from "../../_lib/api";

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
  if (path === "/auth/internal/login") {
    const { response, body } = await fetchApiJson<T & { code?: string }>(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    if (!response.ok) throw new ApiError(body.error ?? "Request failed", body.code);
    return body;
  }
  try {
    return await authenticatedApiRequest(path, init, getAdminSession(), saveAdminSession);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearAdminSession();
      redirectToCurrentPortalLogin();
    }
    throw error;
  }
}

export async function logoutAdmin(): Promise<void> {
  const session = getAdminSession();
  clearAdminSession();
  await revokeSession(session);
}

export async function downloadAdminExport(path: string, fileName: string): Promise<void> {
  try {
    const response = await authenticatedRawRequest(path, undefined, getAdminSession(), saveAdminSession);
    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearAdminSession();
      redirectToCurrentPortalLogin();
    }
    throw error;
  }
}
