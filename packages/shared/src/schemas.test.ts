import { describe, expect, it } from "vitest";
import {
  citizenLoginSchema,
  civicWorkCalendarQuerySchema,
  civicWorkGeometrySchema,
  civicWorkLedgerQuerySchema,
  createPlannedCivicWorkSchema,
  createTicketSchema,
  internalLoginSchema,
  listCivicWorksQuerySchema,
  requestOtpSchema,
  submitValidationSchema,
  ticketStateSchema,
  toCitizenTicketState,
} from "./schemas";

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

  it("accepts explicit web and mobile ticket channels while keeping the field optional", () => {
    const report = {
      categoryId: "40000000-0000-4000-8000-000000000001",
      title: "Pothole near the bus stop",
      address: "Jayanagar, Bengaluru",
      latitude: 12.9295,
      longitude: 77.5854,
      primaryImage: { fileName: "pothole.jpg", contentType: "image/jpeg" as const },
    };
    expect(createTicketSchema.parse({ ...report, channel: "WEB" }).channel).toBe("WEB");
    expect(createTicketSchema.parse({ ...report, channel: "MOBILE" }).channel).toBe("MOBILE");
    expect(createTicketSchema.parse(report).channel).toBeUndefined();
  });

  it("accepts a server validation token instead of a second primary upload", () => {
    expect(createTicketSchema.parse({
      categoryId: "40000000-0000-4000-8000-000000000001",
      channel: "MOBILE",
      title: "Pothole near the bus stop",
      address: "Jayanagar, Bengaluru",
      latitude: 12.9295,
      longitude: 77.5854,
      primaryImage: { validationToken: "signed-image-validation" },
    }).primaryImage).toEqual({ validationToken: "signed-image-validation" });
  });

  it("validates planned-work dates and requires a spatial reference", () => {
    const input = {
      title: "BTM water-main replacement",
      description: "Replace an aging distribution main and reinstate the affected public road.",
      categoryId: "30000000-0000-4000-8000-000000000003",
      wardId: "10000000-0000-4000-8000-000000000005",
      proposedStart: "2026-10-20T00:00:00.000Z",
      proposedEnd: "2026-10-10T00:00:00.000Z",
    };
    expect(createPlannedCivicWorkSchema.safeParse(input).success).toBe(false);
    expect(createPlannedCivicWorkSchema.safeParse({
      ...input,
      proposedEnd: "2026-10-22T00:00:00.000Z",
      geometry: { type: "Point", coordinates: [77.6101, 12.9166] },
    }).success).toBe(true);
  });

  it("rejects unclosed civic-work polygons and partial area filters", () => {
    expect(civicWorkGeometrySchema.safeParse({
      type: "Polygon",
      coordinates: [[[77.60, 12.90], [77.61, 12.90], [77.61, 12.91], [77.60, 12.91]]],
    }).success).toBe(false);
    expect(listCivicWorksQuerySchema.safeParse({ minLongitude: "77.60" }).success).toBe(false);
    expect(listCivicWorksQuerySchema.safeParse({
      minLongitude: "77.60", minLatitude: "12.90", maxLongitude: "77.62", maxLatitude: "12.92",
    }).success).toBe(true);
  });

  it("requires bounded calendar and ledger reads", () => {
    const dates = { dateFrom: "2026-01-01T00:00:00.000Z", dateTo: "2026-12-31T23:59:59.999Z" };
    expect(civicWorkCalendarQuerySchema.safeParse(dates).success).toBe(false);
    expect(civicWorkCalendarQuerySchema.safeParse({ ...dates, wardId: "10000000-0000-4000-8000-000000000004" }).success).toBe(true);
    expect(civicWorkCalendarQuerySchema.safeParse({ ...dates, wardId: "10000000-0000-4000-8000-000000000004", dateTo: "2028-01-02T00:00:00.000Z" }).success).toBe(false);
    expect(civicWorkLedgerQuerySchema.safeParse({}).success).toBe(false);
    expect(civicWorkLedgerQuerySchema.safeParse({ roadSegmentId: "80000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });
});
