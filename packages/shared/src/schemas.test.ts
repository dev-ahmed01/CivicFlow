import { describe, expect, it } from "vitest";
import { citizenLoginSchema, internalLoginSchema, requestOtpSchema, submitValidationSchema, ticketStateSchema, toCitizenTicketState } from "./schemas";

describe("shared schemas", () => {
  it("accepts a citizen phone in E.164 format", () => {
    expect(requestOtpSchema.parse({ phone: "+919876543210" })).toEqual({
      phone: "+919876543210",
    });
  });

  it("contains future ticket workflow states", () => {
    expect(ticketStateSchema.parse("AWAITING_CITIZEN_VERIFICATION")).toBe(
      "AWAITING_CITIZEN_VERIFICATION",
    );
  });

  it("maps every internal ticket state to one of eight citizen states", () => {
    const mapped = new Set(ticketStateSchema.options.map(toCitizenTicketState));
    expect(mapped).toEqual(new Set([
      "REPORT_RECEIVED", "COMMUNITY_REVIEW", "VERIFIED", "ASSIGNED",
      "INSPECTION_AND_PLANNING", "WORK_IN_PROGRESS", "AWAITING_CONFIRMATION", "CLOSED",
    ]));
  });

  it("supports all three unanchored community-verification actions", () => {
    expect(["CONFIRM", "NOT_SURE", "REJECT"].map((vote) => submitValidationSchema.parse({ vote }).vote)).toEqual([
      "CONFIRM", "NOT_SURE", "REJECT",
    ]);
  });

  it("accepts an explicit internal workspace role and rejects citizen as an internal role", () => {
    expect(internalLoginSchema.parse({ email: "head@example.com", password: "password", expectedRole: "PROJECT_HEAD" }).expectedRole).toBe("PROJECT_HEAD");
    expect(internalLoginSchema.safeParse({ email: "citizen@example.com", password: "password", expectedRole: "CITIZEN" }).success).toBe(false);
  });

  it("accepts a citizen user ID without requiring email syntax", () => {
    expect(citizenLoginSchema.parse({ userId: "+919876500001", password: "CityConnect@123" }).userId).toBe("+919876500001");
    expect(citizenLoginSchema.parse({ userId: "citizen.jayanagar", password: "CityConnect@123" }).userId).toBe("citizen.jayanagar");
  });
});
