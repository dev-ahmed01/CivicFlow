"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { type RoadScanOptions } from "@civicos/shared";
import { apiFetch } from "../_lib/api";
export function ScanAttention() {
  const [count, setCount] = useState(0);
  useEffect(() => { void apiFetch<RoadScanOptions>("/project-head/road-scans/options").then(result => setCount(result.newCandidates)).catch(() => undefined); }, []);
  return count ? <p className="scan-attention"><Link href="/project-head/road-scans">{count} new Area Scan candidate{count === 1 ? "" : "s"} awaiting review →</Link></p> : null;
}
