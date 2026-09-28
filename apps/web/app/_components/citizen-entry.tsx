"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCitizenSession } from "../_lib/citizen-auth";
import { CitizenHome } from "./citizen-home";

export function CitizenEntry() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (!getCitizenSession()) {
      router.replace("/login");
      return;
    }

    // Login already returned a signed access token. Do not block the citizen
    // home page on an immediate second /protected/me round trip. Every protected
    // API call still validates the JWT and the shared API client clears/redirects
    // the session on 401, so security enforcement remains server-side.
    setAuthenticated(true);
  }, [router]);

  if (!authenticated) {
    return <main className="citizen-shell cf-entry-loading" aria-live="polite">Opening CityConnect…</main>;
  }

  return <CitizenHome />;
}
