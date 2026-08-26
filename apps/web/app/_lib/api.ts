"use client";

export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ApiErrorBody = { error?: string };

export class ApiRequestError extends Error {
  constructor(message: string, readonly status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiRequestError";
  }
}

export async function fetchApiJson<T>(path: string, init?: RequestInit): Promise<{ response: Response; body: T & ApiErrorBody }> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, { ...init, cache: "no-store" });
  } catch (cause) {
    throw new ApiRequestError(
      `The CivicFlow API is unreachable at ${apiUrl}. Start it with \`pnpm dev\` and check ${apiUrl}/health.`,
      undefined,
      { cause },
    );
  }
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  return { response, body };
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { response, body } = await fetchApiJson<T>(path, init);
  if (!response.ok) {
    const message = response.status >= 500
      ? "The CivicFlow API returned a server error. Please try again."
      : body.error ?? `Request failed (${response.status})`;
    throw new ApiRequestError(message, response.status);
  }
  return body;
}

export type RefreshableSession = {
  accessToken: string;
  refreshToken: string;
};

type RotatedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

const refreshes = new Map<string, Promise<RotatedTokens>>();

async function rotateSession(refreshToken: string): Promise<RotatedTokens> {
  const existing = refreshes.get(refreshToken);
  if (existing) return existing;
  const pending = apiRequest<RotatedTokens>("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).finally(() => refreshes.delete(refreshToken));
  refreshes.set(refreshToken, pending);
  return pending;
}

export async function authenticatedApiRequest<T, TSession extends RefreshableSession>(
  path: string,
  init: RequestInit | undefined,
  session: TSession | null,
  save: (session: TSession) => void,
): Promise<T> {
  const request = (token?: string) => apiRequest<T>(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  try {
    return await request(session?.accessToken);
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401 || !session?.refreshToken || path === "/auth/refresh") throw error;
    const tokens = await rotateSession(session.refreshToken);
    save({ ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    return request(tokens.accessToken);
  }
}

export async function authenticatedRawRequest<TSession extends RefreshableSession>(
  path: string,
  init: RequestInit | undefined,
  session: TSession | null,
  save: (session: TSession) => void,
): Promise<Response> {
  const request = async (token?: string) => {
    try {
      return await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
      });
    } catch (cause) {
      throw new ApiRequestError(`The CivicFlow API is unreachable at ${apiUrl}.`, undefined, { cause });
    }
  };
  let response = await request(session?.accessToken);
  if (response.status === 401 && session?.refreshToken) {
    const tokens = await rotateSession(session.refreshToken);
    save({ ...session, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    response = await request(tokens.accessToken);
  }
  if (!response.ok) {
    const body = await response.clone().json().catch(() => ({})) as ApiErrorBody;
    throw new ApiRequestError(body.error ?? `Request failed (${response.status})`, response.status);
  }
  return response;
}

export async function revokeSession(session: RefreshableSession | null): Promise<void> {
  if (!session?.refreshToken) return;
  try {
    await apiRequest("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } catch {
    // Local session clearing still completes when the API is unavailable.
  }
}

export function portalLoginPath(pathname: string): string {
  if (pathname.startsWith("/project-head")) return "/project-head/login";
  if (pathname.startsWith("/engineer")) return "/engineer/login";
  if (pathname.startsWith("/admin")) return "/admin/login";
  return "/login";
}

export function redirectToCurrentPortalLogin(): void {
  if (typeof window === "undefined") return;
  const loginPath = portalLoginPath(window.location.pathname);
  if (window.location.pathname !== loginPath) window.location.replace(loginPath);
}
