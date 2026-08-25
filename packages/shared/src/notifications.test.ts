import { describe, expect, it } from "vitest";
import { notificationDayGroup, notificationDestination, notificationMatchesFilter, notificationPresentation, relativeNotificationTime } from "./notifications";

describe("notification presentation", () => {
  it.each([
    ["VALIDATION_REQUEST", "info"],
    ["TICKET_VALIDATED", "success"],
    ["TICKET_ROUTED_TO_AGENCY", "success"],
    ["WORK_STARTED", "info"],
    ["WORK_COMPLETED", "warning"],
    ["TICKET_RESOLVED", "success"],
    ["DEPENDENCY_REQUEST", "warning"],
    ["DEPENDENCY_ESCALATED", "danger"],
    ["PROJECT_ASSIGNMENT", "info"],
  ] as const)("maps %s to %s", (type, tone) => {
    expect(notificationPresentation(type).tone).toBe(tone);
  });

  it("always maps conflict and sequencing notices to warning amber", () => {
    expect(notificationPresentation("CONFLICT_DETECTED").tone).toBe("warning");
    expect(notificationPresentation("ROAD_CONFLICT_DETECTED").tone).toBe("warning");
    expect(notificationPresentation("SEQUENCING_RECOMMENDATION").tone).toBe("warning");
  });

  it("supports role-specific filter categories", () => {
    expect(notificationMatchesFilter("DEPENDENCY_ESCALATED", "dependencies")).toBe(true);
    expect(notificationMatchesFilter("PROJECT_ASSIGNMENT", "assignments")).toBe(true);
    expect(notificationMatchesFilter("CONFLICT_DETECTED", "conflicts")).toBe(true);
    expect(notificationMatchesFilter("WORK_COMPLETED", "completion")).toBe(true);
  });

  it("keeps citizen notification navigation inside the citizen ticket workflow", () => {
    expect(notificationDestination({ type: "TICKET_RESOLVED", payload: { ticketId: "ticket-1" } }, "CITIZEN")).toBe("/tickets/ticket-1");
    expect(notificationDestination({ type: "GENERAL", payload: {} }, "CITIZEN")).toBe("/tickets");
  });
});

describe("notification time helpers", () => {
  const now = new Date(2026, 7, 23, 12, 0, 0);
  it("groups dates for the notification center", () => {
    expect(notificationDayGroup(new Date(2026, 7, 23, 8), now)).toBe("Today");
    expect(notificationDayGroup(new Date(2026, 7, 22, 8), now)).toBe("Yesterday");
    expect(notificationDayGroup(new Date(2026, 7, 20, 8), now)).toBe("Earlier");
  });
  it("renders concise relative times", () => {
    expect(relativeNotificationTime(new Date(now.getTime() - 120_000), now)).toBe("2m ago");
  });
});
