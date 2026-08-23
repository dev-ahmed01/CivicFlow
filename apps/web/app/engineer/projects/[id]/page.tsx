import { EngineerProjectDetailClient } from "./project-detail-client";

export default function EngineerProjectPage({ params }: { params: { id: string } }) {
  return <EngineerProjectDetailClient projectId={params.id} />;
}
