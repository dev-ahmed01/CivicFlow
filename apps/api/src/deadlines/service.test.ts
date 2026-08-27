import { WorkflowActionType } from "db";
import { describe, expect, it } from "vitest";
import { AUTO_GRIEVANCE_WINDOW_MS, deadlineEscalationDecision, responseDeadline } from "./service";

describe("workflow response deadlines", () => {
  const createdAt = new Date("2026-08-20T00:00:00.000Z");

  it("stores a default three-day deadline", () => {
    expect(responseDeadline(createdAt).toISOString()).toBe("2026-08-23T00:00:00.000Z");
  });

  it("preserves an explicit deadline", () => {
    const explicit = new Date("2026-09-01T12:00:00.000Z");
    expect(responseDeadline(createdAt, explicit)).toBe(explicit);
  });

  it("creates the one-day attention signal once", () => {
    const deadline = new Date("2026-08-23T00:00:00.000Z");
    const base = { type: WorkflowActionType.ACCEPT_PROJECT, createdAt, deadline, respondedAt: null, grievanceExists: false };
    expect(deadlineEscalationDecision({ ...base, attentionNotifiedAt: null }, new Date("2026-08-22T00:00:00.000Z")).createAttention).toBe(true);
    expect(deadlineEscalationDecision({ ...base, attentionNotifiedAt: new Date("2026-08-22T00:00:00.000Z") }, new Date("2026-08-22T12:00:00.000Z")).createAttention).toBe(false);
  });

  it("creates a grievance after five unanswered days and never duplicates it", () => {
    const now = new Date(createdAt.getTime() + AUTO_GRIEVANCE_WINDOW_MS);
    const base = { type: WorkflowActionType.ACCEPT_PROJECT, createdAt, deadline: responseDeadline(createdAt), respondedAt: null, attentionNotifiedAt: null };
    expect(deadlineEscalationDecision({ ...base, grievanceExists: false }, now).createGrievance).toBe(true);
    expect(deadlineEscalationDecision({ ...base, grievanceExists: true }, now).createGrievance).toBe(false);
  });
});
