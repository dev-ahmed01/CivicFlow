import { permanentRedirect } from "next/navigation";

export default function TicketQueueCompatibilityPage({ searchParams }: { searchParams?: { ticket?: string } }) {
  if (searchParams?.ticket) permanentRedirect(`/project-head/tickets/${searchParams.ticket}`);
  permanentRedirect("/project-head/projects?view=INTAKE");
}
