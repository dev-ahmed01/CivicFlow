"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearCitizenAccessToken, getCitizenAccessToken } from "../_lib/citizen-auth";
import { CitizenHome } from "./citizen-home";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CitizenEntry() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const token = getCitizenAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    let active = true;
    void fetch(`${apiUrl}/protected/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { auth?: { role?: string } };
        if (!response.ok || body.auth?.role !== "CITIZEN") throw new Error("Citizen session expired");
        if (active) setAuthenticated(true);
      })
      .catch(() => {
        clearCitizenAccessToken();
        if (active) router.replace("/login");
      });
    return () => { active = false; };
  }, [router]);

  if (!authenticated) {
    return <main className="citizen-shell cf-entry-loading" aria-live="polite">Opening CityConnect…</main>;
  }

  return <CitizenHome />;
}
