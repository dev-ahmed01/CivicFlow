import { CoordinationDetailClient } from "./coordination-detail-client";

export default function CoordinationDetailPage({ params }: { params: { id: string } }) {
  return <CoordinationDetailClient requestId={params.id} />;
}
