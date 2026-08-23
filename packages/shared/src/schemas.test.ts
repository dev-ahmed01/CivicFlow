import { describe, expect, it } from "vitest";
import { requestOtpSchema, ticketStateSchema } from "./schemas";

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
});
