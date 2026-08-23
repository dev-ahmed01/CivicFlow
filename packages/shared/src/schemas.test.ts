import { describe, expect, it } from "vitest";
import { requestOtpSchema, ticketStateSchema, toCitizenTicketState } from "./schemas";

describe("shared schemas", () => {
  it("accepts a citizen phone in E.164 format", () => {
    expect(requestOtpSchema.parse({ phone: "+919876543210" })).toEqual({
      phone: "+919876543210",
    });
  });

  it("contains future ticket workflow states", () => {
    expect(ticketStateSchema.parse("PENDING_CITIZEN_VERIFICATION")).toBe(
      "PENDING_CITIZEN_VERIFICATION",
    );
  });

  it("maps every internal ticket state to one of eight citizen states", () => {
    const mapped = new Set(ticketStateSchema.options.map(toCitizenTicketState));
    expect(mapped).toEqual(new Set([
      "REPORT_RECEIVED", "COMMUNITY_REVIEW", "VERIFIED", "ASSIGNED",
      "INSPECTION_AND_PLANNING", "WORK_IN_PROGRESS", "AWAITING_CONFIRMATION", "CLOSED",
    ]));
  });
});
