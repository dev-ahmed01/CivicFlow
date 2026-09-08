import { Suspense, type ReactNode } from "react";
import { ProjectHeadShell } from "./_components/project-head-shell";

export default function ProjectHeadLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="portal-loading">Opening your agency workspace…</main>}><ProjectHeadShell>{children}</ProjectHeadShell></Suspense>;
}
