import { Prisma, TicketState, UserRole } from "db";
import { createNotifications } from "../notifications/service";

type DatabaseClient = Prisma.TransactionClient;

export async function routeValidatedTicket(
  client: DatabaseClient,
  ticketId: string,
): Promise<string> {
  const ticket = await client.ticket.findUnique({
    where: { id: ticketId },
    select: {
      state: true,
      reporterId: true,
      category: { select: { primaryAgencyId: true } },
    },
  });
  if (!ticket) throw new Error("Ticket not found during agency routing");
  if (ticket.state !== TicketState.PENDING_VALIDATION) {
    throw new Error(`Ticket ${ticketId} cannot be routed from ${ticket.state}`);
  }

  // Part III §7 — the database mapping is authoritative; no category or agency
  // identifiers are encoded in application logic.
  const agencyId = ticket.category.primaryAgencyId;
  await client.ticket.update({
    where: { id: ticketId },
    data: { state: TicketState.ROUTED_TO_AGENCY, assignedAgencyId: agencyId },
  });
  await client.ticketStateTransition.createMany({
    data: [
      {
        ticketId,
        fromState: TicketState.PENDING_VALIDATION,
        toState: TicketState.VALIDATED,
        reason: "COMMUNITY_VALIDATION_QUORUM_MET",
      },
      {
        ticketId,
        fromState: TicketState.VALIDATED,
        toState: TicketState.ROUTED_TO_AGENCY,
        reason: "CATEGORY_PRIMARY_AGENCY_ROUTING",
      },
    ],
  });
  const projectHeads = await client.user.findMany({
    where: { agencyId, role: UserRole.PROJECT_HEAD },
    select: { id: true },
  });
  await createNotifications(client, [
    ...(ticket.reporterId ? [
      { userId: ticket.reporterId, type: "TICKET_VALIDATED", payload: { ticketId } },
      { userId: ticket.reporterId, type: "TICKET_ROUTED_TO_AGENCY", payload: { ticketId, agencyId } },
    ] : []),
    ...projectHeads.map(({ id }) => ({ userId: id, type: "TICKET_ROUTED_TO_AGENCY", payload: { ticketId, agencyId } })),
  ]);
  return agencyId;
}
