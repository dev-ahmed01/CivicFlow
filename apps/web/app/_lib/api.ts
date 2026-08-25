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
