"use client";

import { useEffect, useState } from "react";
import { RoadIntelligencePanel, type RoadIntelligenceData } from "../../../_components/road-intelligence-panel";
import { apiFetch } from "../../_lib/api";

export function EngineerRoadIntelligenceClient({ projectId }: { projectId: string }) {
  const [data, setData] = useState<RoadIntelligenceData>();
  useEffect(() => {
    void apiFetch<RoadIntelligenceData>(`/projects/${projectId}/road-intelligence`).then(setData);
  }, [projectId]);
  return data ? <RoadIntelligencePanel data={data} projectId={projectId} /> : null;
}
