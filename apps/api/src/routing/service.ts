import { Prisma, TicketState, UserRole } from "db";
import { createNotifications } from "../notifications/service";

type DatabaseClient = Prisma.TransactionClient;

type RouteTicketOptions = {
  fromState: TicketState;
  transitions: Array<{
    fromState: TicketState;
    toState: TicketState;
    reason: string;
  }>;
  notifyValidated: boolean;
  actedById?: string;
};

async function routeTicketToConfiguredAgency(
  client: DatabaseClient,
  ticketId: string,
  options: RouteTicketOptions,
): Promise<string> {
  const ticket = await client.ticket.findUnique({
    where: { id: ticketId },
    select: {
      state: true,
      reporterId: true,
      observations: { select: { submitterId: true }, distinct: ["submitterId"] },
      category: { select: { primaryAgencyId: true } },
    },
  });
  if (!ticket) throw new Error("Ticket not found during agency routing");
  if (ticket.state !== options.fromState) {
    throw new Error(`Ticket ${ticketId} cannot be routed from ${ticket.state}`);
  }

  // Part III §7 — the database mapping selected through the category menu is
  // authoritative; clients never choose or submit an agency assignment.
  const agencyId = ticket.category.primaryAgencyId;
  await client.ticket.update({
    where: { id: ticketId },
    data: { state: TicketState.ROUTED_TO_AGENCY, assignedAgencyId: agencyId },
  });
  await client.ticketStateTransition.createMany({
    data: options.transitions.map((transition) => ({ ticketId, ...transition, actedById: options.actedById })),
  });
  const projectHeads = await client.user.findMany({
    where: { agencyId, role: UserRole.PROJECT_HEAD },
    select: { id: true },
  });
  const citizenIds = [...new Set(ticket.observations.map(({ submitterId }) => submitterId))];
  await createNotifications(client, [
    ...citizenIds.flatMap((userId) => [
      ...(options.notifyValidated ? [{ userId, type: "TICKET_VALIDATED", payload: { ticketId } }] : []),
      { userId, type: "TICKET_ROUTED_TO_AGENCY", payload: { ticketId, agencyId } },
    ]),
    ...projectHeads.map(({ id }) => ({ userId: id, type: "TICKET_ROUTED_TO_AGENCY", payload: { ticketId, agencyId } })),
  ]);
  return agencyId;
}

export async function routeValidatedTicket(
  client: DatabaseClient,
  ticketId: string,
  actedById?: string,
): Promise<string> {
  return routeTicketToConfiguredAgency(client, ticketId, {
    fromState: TicketState.PENDING_VALIDATION,
    transitions: [
      {
        fromState: TicketState.PENDING_VALIDATION,
        toState: TicketState.VALIDATED,
        reason: "COMMUNITY_VALIDATION_QUORUM_MET",
      },
      {
        fromState: TicketState.VALIDATED,
        toState: TicketState.ROUTED_TO_AGENCY,
        reason: "CATEGORY_PRIMARY_AGENCY_ROUTING",
      },
    ],
    notifyValidated: true,
    actedById,
  });
}

export async function routeRelevantWebTicket(
  client: DatabaseClient,
  ticketId: string,
  actedById?: string,
): Promise<string> {
  return routeTicketToConfiguredAgency(client, ticketId, {
    fromState: TicketState.AI_CHECK_PENDING,
    transitions: [{
      fromState: TicketState.AI_CHECK_PENDING,
      toState: TicketState.ROUTED_TO_AGENCY,
      reason: "WEB_RELEVANCE_CHECK_PASSED_CATEGORY_ROUTING",
    }],
    notifyValidated: false,
    actedById,
  });
}
