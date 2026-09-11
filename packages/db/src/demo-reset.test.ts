import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { assertDemoResetAllowed, demoDeletionOrder } from "./demo-reset";

describe("demo reset safety", () => {
  const allowed = { DATABASE_URL: "postgresql://demo:secret@localhost:5433/demo", ALLOW_DEMO_RESET: "true", DEMO_RESET_TARGET: "localhost:5433/demo" };
  it("requires explicit opt-in and exact target", () => {
    expect(() => assertDemoResetAllowed({})).toThrow();
    expect(() => assertDemoResetAllowed({ ...allowed, DEMO_RESET_TARGET: "other" })).toThrow();
    expect(assertDemoResetAllowed(allowed)).toBe("localhost:5433/demo");
  });
  it("refuses production and remote databases without a separate acknowledgement", () => {
    expect(() => assertDemoResetAllowed({ ...allowed, NODE_ENV: "production" })).toThrow();
    expect(() => assertDemoResetAllowed({ ...allowed, DATABASE_URL: "postgresql://demo:secret@remote:5433/demo", DEMO_RESET_TARGET: "remote:5433/demo" })).toThrow();
  });
  it("covers every application table and deletes referencing rows first", () => {
    const order = demoDeletionOrder();
    expect(order).toHaveLength(Prisma.dmmf.datamodel.models.length - 3);
    for (const model of Prisma.dmmf.datamodel.models) {
      if (!order.includes(model.name)) continue;
      for (const field of model.fields.filter((f) => f.relationFromFields?.length && f.type !== model.name)) {
        if (order.includes(field.type)) expect(order.indexOf(model.name)).toBeLessThan(order.indexOf(field.type));
      }
    }
  });
});
