import type { ReactNode } from "react";
import { ProjectHeadShell } from "./_components/project-head-shell";

export default function ProjectHeadLayout({ children }: { children: ReactNode }) {
  return <ProjectHeadShell>{children}</ProjectHeadShell>;
}
