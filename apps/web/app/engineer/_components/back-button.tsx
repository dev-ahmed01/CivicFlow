"use client";

import { useRouter } from "next/navigation";
import { hasEngineerHistory } from "../_lib/navigation";

export function EngineerBackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return <button className="back-link engineer-text-button" type="button" onClick={() => hasEngineerHistory() ? router.back() : router.replace(fallback)}>← Back</button>;
}
