import "./engineer.css";
import type { ReactNode } from "react";
import { EngineerShell } from "./_components/engineer-shell";

export default function EngineerLayout({ children }: { children: ReactNode }) {
  return <EngineerShell>{children}</EngineerShell>;
}
