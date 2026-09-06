import "./engineer.css";
import { Suspense, type ReactNode } from "react";
import { EngineerShell } from "./_components/engineer-shell";

export default function EngineerLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="portal-loading">Opening field operations…</main>}><EngineerShell>{children}</EngineerShell></Suspense>;
}
