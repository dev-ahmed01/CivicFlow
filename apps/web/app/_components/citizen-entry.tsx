"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { citizenApiFetch, clearCitizenSession, getCitizenSession } from "../_lib/citizen-auth";
import { CitizenHome } from "./citizen-home";

export function CitizenEntry() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (!getCitizenSession()) {
      router.replace("/login");
      return;
    }
    let active = true;
    void citizenApiFetch<{ auth?: { role?: string } }>("/protected/me")
      .then((body) => {
        if (body.auth?.role !== "CITIZEN") throw new Error("Citizen session expired");
        if (active) setAuthenticated(true);
      })
      .catch(() => {
        clearCitizenSession();
        if (active) router.replace("/login");
      });
    return () => { active = false; };
  }, [router]);

  if (!authenticated) {
    return <main className="citizen-shell cf-entry-loading" aria-live="polite">Opening CityConnect…</main>;
  }

  return <CitizenHome />;
}
