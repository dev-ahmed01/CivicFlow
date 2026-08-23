import { ProjectCreateClient } from "./project-create-client";

export default function ProjectCreatePage({ searchParams }: { searchParams: { ticketId?: string } }) {
  return <ProjectCreateClient ticketId={searchParams.ticketId ?? ""} />;
}
