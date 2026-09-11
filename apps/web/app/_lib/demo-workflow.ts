"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../project-head/_lib/api";
import { apiFetch as engineerApiFetch } from "../engineer/_lib/api";

export function useDemoWorkflow() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const fetcher = window.location.pathname.startsWith("/engineer") ? engineerApiFetch : apiFetch;
    void fetcher<{ demoDefaults: boolean }>("/workflow-options").then((result) => { if (active) setEnabled(result.demoDefaults); }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  return enabled;
}
