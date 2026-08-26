import { Prisma, TicketState } from "db";
import { describe, expect, it, vi } from "vitest";
import { routeRelevantWebTicket } from "./service";

describe("direct web agency routing", () => {
  it("uses the category's configured agency without creating a validation request", async () => {
    const client = {
      ticket: {
        findUnique: vi.fn(async () => ({
          state: TicketState.AI_CHECK_PENDING,
          reporterId: "40000000-0000-4000-8000-000000000001",
          category: { primaryAgencyId: "40000000-0000-4000-8000-000000000002" },
        })),
        update: vi.fn(async () => ({})),
      },
      ticketStateTransition: { createMany: vi.fn(async () => ({ count: 1 })) },
      user: { findMany: vi.fn(async () => [{ id: "40000000-0000-4000-8000-000000000003" }]) },
      notification: { createMany: vi.fn(async () => ({ count: 2 })) },
      validationRequest: { createMany: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(routeRelevantWebTicket(client, "40000000-0000-4000-8000-000000000004"))
      .resolves.toBe("40000000-0000-4000-8000-000000000002");
    expect(client.ticket.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { state: TicketState.ROUTED_TO_AGENCY, assignedAgencyId: "40000000-0000-4000-8000-000000000002" },
    }));
    expect(client.ticketStateTransition.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({
      fromState: TicketState.AI_CHECK_PENDING,
      toState: TicketState.ROUTED_TO_AGENCY,
      reason: "WEB_RELEVANCE_CHECK_PASSED_CATEGORY_ROUTING",
    })] });
    expect(client.validationRequest.createMany).not.toHaveBeenCalled();
    expect(client.notification.createMany).toHaveBeenCalledWith({ data: expect.not.arrayContaining([
      expect.objectContaining({ type: "TICKET_VALIDATED" }),
    ]) });
  });
});
