import type { ReactNode } from "react";
import { CitizenHeader } from "../_components/citizen-header";

export default function TicketsLayout({ children }: { children: ReactNode }) {
  return <><CitizenHeader />{children}</>;
}
