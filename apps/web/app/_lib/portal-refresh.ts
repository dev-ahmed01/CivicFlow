"use client";

import { useEffect } from "react";

const portalDataChangedEvent = "civicos:portal-data-changed";

export function notifyPortalDataChanged(): void {
  window.dispatchEvent(new Event(portalDataChangedEvent));
}

export function usePortalPolling(load: () => Promise<void> | void, intervalMs = 15_000): void {
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (!active || document.hidden || inFlight) return;
      inFlight = true;
      try {
        await load();
      } finally {
        inFlight = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), intervalMs);
    window.addEventListener("focus", refresh);
    window.addEventListener(portalDataChangedEvent, refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(portalDataChangedEvent, refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [intervalMs, load]);
}
