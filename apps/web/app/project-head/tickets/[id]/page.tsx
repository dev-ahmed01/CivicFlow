import { TicketDetailClient } from "./ticket-detail-client";

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return <TicketDetailClient ticketId={params.id} />;
}
