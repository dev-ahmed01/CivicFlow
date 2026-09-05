import type { ReactNode } from "react";

export function EngineerSymbol({ name }: { name: string }) {
  return <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {name === "people" ? <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" /></> : name === "blocked" ? <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></> : name === "attention" ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></> : name === "tip" ? <><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0l-1 3H9zM12 1v1M2 10H1m22 0h-1M4 3l1 1m14 0 1-1" /></> : <><rect x="4" y="5" width="16" height="16" rx="2" /><path d={name === "calendar" ? "M8 3v5m8-5v5M4 11h16" : "M12 2v12m-4-4 4 4 4-4"} /></>}
  </svg>;
}

export function EngineerTip({ children }: { children: ReactNode }) {
  return <aside className="engineer-tip"><span className="engineer-symbol green"><EngineerSymbol name="tip" /></span><p><span>Tip: </span>{children}</p></aside>;
}
