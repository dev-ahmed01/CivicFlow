"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useEngineerQuery() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const update = (changes: Record<string, string | undefined>, replace = false) => {
    const query = new URLSearchParams(params.toString());
    Object.entries(changes).forEach(([key, value]) => value ? query.set(key, value) : query.delete(key));
    const href = pathname + (query.size ? `?${query}` : "");
    if (href === pathname + (params.size ? `?${params}` : "")) return;
    router[replace ? "replace" : "push"](href, { scroll: false });
  };
  return { params, update };
}

export function queryPage(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

const previousKey = "cityConnectEngineerPrevious";

// Record provenance on the browser entry, preserving Next's own history state.
// history.length alone also counts external pages and is unsafe for a direct entry.
export function trackEngineerHistory() {
  const push = window.history.pushState;
  const replace = window.history.replaceState;
  window.history.pushState = function (data, unused, url) {
    const inEngineer = window.location.pathname.startsWith("/engineer") && window.location.pathname !== "/engineer/login";
    return push.call(this, { ...data, [previousKey]: inEngineer }, unused, url);
  };
  window.history.replaceState = function (data, unused, url) {
    return replace.call(this, { ...data, [previousKey]: Boolean(window.history.state?.[previousKey]) }, unused, url);
  };
  return () => { window.history.pushState = push; window.history.replaceState = replace; };
}

export function hasEngineerHistory(): boolean {
  return Boolean(window.history.state?.[previousKey]);
}
