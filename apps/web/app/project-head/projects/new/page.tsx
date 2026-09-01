import { ProjectCreateClient } from "./project-create-client";
import { PlannedWorkCreateClient } from "./planned-work-create-client";

export default function ProjectCreatePage({ searchParams }: { searchParams: { ticketId?: string } }) {
  return searchParams.ticketId ? <ProjectCreateClient ticketId={searchParams.ticketId} /> : <PlannedWorkCreateClient />;
}
