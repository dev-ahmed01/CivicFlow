const fallbackToken = process.env.NEXT_PUBLIC_ACCESS_TOKEN ?? "";

export function getCitizenAccessToken(): string {
  return typeof window === "undefined" ? fallbackToken : window.localStorage.getItem("civicos.citizen.accessToken") ?? fallbackToken;
}

export function saveCitizenAccessToken(token: string): void {
  window.localStorage.setItem("civicos.citizen.accessToken", token);
}

export function clearCitizenAccessToken(): void {
  window.localStorage.removeItem("civicos.citizen.accessToken");
}
