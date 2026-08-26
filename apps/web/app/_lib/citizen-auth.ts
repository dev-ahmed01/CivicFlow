"use client";

import { ApiRequestError, authenticatedApiRequest, revokeSession } from "./api";

const sessionKey = "civicos.citizen.session.v2";
const legacyAccessTokenKey = "civicos.citizen.accessToken";
const fallbackToken = process.env.NEXT_PUBLIC_ACCESS_TOKEN ?? "";

export type CitizenSession = {
  accessToken: string;
  refreshToken: string;
};

export function getCitizenSession(): CitizenSession | null {
  if (typeof window === "undefined") return fallbackToken ? { accessToken: fallbackToken, refreshToken: "" } : null;
  const stored = window.localStorage.getItem(sessionKey) ?? window.sessionStorage.getItem(sessionKey);
  if (stored) {
    try { return JSON.parse(stored) as CitizenSession; }
    catch { clearCitizenSession(); }
  }
  const legacy = window.localStorage.getItem(legacyAccessTokenKey);
  return legacy ? { accessToken: legacy, refreshToken: "" } : fallbackToken ? { accessToken: fallbackToken, refreshToken: "" } : null;
}

export function getCitizenAccessToken(): string {
  return getCitizenSession()?.accessToken ?? "";
}

export function saveCitizenSession(session: CitizenSession, remember = true): void {
  clearCitizenSession();
  (remember ? window.localStorage : window.sessionStorage).setItem(sessionKey, JSON.stringify(session));
}

export function clearCitizenSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(sessionKey);
  window.sessionStorage.removeItem(sessionKey);
  window.localStorage.removeItem(legacyAccessTokenKey);
}

export const clearCitizenAccessToken = clearCitizenSession;

export async function citizenApiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await authenticatedApiRequest(path, init, getCitizenSession(), (session) => saveCitizenSession(session, Boolean(window.localStorage.getItem(sessionKey))));
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      clearCitizenSession();
      if (window.location.pathname !== "/login") window.location.replace("/login");
    }
    throw error;
  }
}

export async function logoutCitizen(): Promise<void> {
  const session = getCitizenSession();
  clearCitizenSession();
  await revokeSession(session);
}
