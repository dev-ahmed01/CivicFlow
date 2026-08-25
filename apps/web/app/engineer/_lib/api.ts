"use client";

import { ApiRequestError, apiRequest, redirectToCurrentPortalLogin } from "../../_lib/api";

const sessionKey = "civicos.engineer.session";

export type EngineerSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; agencyId: string };
};

export function getSession(): EngineerSession | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(sessionKey);
  if (!stored) return null;
  try { return JSON.parse(stored) as EngineerSession; }
  catch { window.localStorage.removeItem(sessionKey); return null; }
}

export function saveSession(session: EngineerSession): void {
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(sessionKey);
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSession()?.accessToken;
  try {
    return await apiRequest<T>(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearSession();
      redirectToCurrentPortalLogin();
    }
    throw error;
  }
}

export async function uploadFile(upload: { uploadUrl: string; headers: Record<string, string> }, file: File): Promise<void> {
  const response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: file });
  if (!response.ok) throw new Error("File upload failed");
}

export function completionContentType(file: File): "image/jpeg" | "image/png" | "image/webp" | "image/heic" {
  if (["image/png", "image/webp", "image/heic"].includes(file.type)) return file.type as "image/png" | "image/webp" | "image/heic";
  return "image/jpeg";
}
