"use client";

import { ApiRequestError, authenticatedApiRequest, redirectToCurrentPortalLogin, revokeSession } from "../../_lib/api";

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
  const session = getSession();
  try {
    return await authenticatedApiRequest(path, init, session, saveSession);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearSession();
      redirectToCurrentPortalLogin();
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  const session = getSession();
  clearSession();
  await revokeSession(session);
}

export async function uploadFile(upload: { uploadUrl: string; headers: Record<string, string> }, file: File): Promise<void> {
  let response: Response;
  try { response = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.headers, body: file }); }
  catch (cause) { throw new Error("The file could not be uploaded. Check your connection and try again.", { cause }); }
  if (!response.ok) throw new Error("File upload failed");
}

export function completionContentType(file: File): "image/jpeg" | "image/png" | "image/webp" | "image/heic" {
  if (["image/png", "image/webp", "image/heic"].includes(file.type)) return file.type as "image/png" | "image/webp" | "image/heic";
  return "image/jpeg";
}
