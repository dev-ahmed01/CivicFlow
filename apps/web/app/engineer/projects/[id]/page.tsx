import { EngineerProjectDetailClient } from "./project-detail-client";
import { EngineerRoadIntelligenceClient } from "./engineer-road-intelligence-client";

export default function EngineerProjectPage({ params }: { params: { id: string } }) {
  return <><EngineerProjectDetailClient projectId={params.id} /><EngineerRoadIntelligenceClient projectId={params.id} /></>;
}
