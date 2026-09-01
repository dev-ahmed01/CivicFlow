import { InspectionDetailClient } from "./inspection-detail-client";

export default function InspectionDetailPage({ params }: { params: { id: string } }) {
  return <InspectionDetailClient inspectionId={params.id} />;
}
