import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("db", () => ({
  prisma: { user: { findUnique } },
  UserRole: { CITIZEN: "CITIZEN", PROJECT_HEAD: "PROJECT_HEAD", ENGINEER: "ENGINEER", ADMIN: "ADMIN" },
}));

vi.mock("bcrypt", () => ({
  default: { compare: vi.fn(async () => true) },
}));

import { createAuthRouter } from "./routes";

describe("internal role login", () => {
  const app = express();
  app.use(express.json());
  app.use("/auth", createAuthRouter({ async sendOtp() {} }));

  beforeEach(() => findUnique.mockReset());

  it("rejects a valid internal account when it does not match the selected workspace", async () => {
    findUnique.mockResolvedValue({
      id: "user-1",
      role: "PROJECT_HEAD",
      email: "head@example.com",
      agencyId: "agency-1",
      passwordHash: "hash",
      mustResetPassword: false,
      totpEnabled: false,
    });

    const response = await request(app).post("/auth/internal/login").send({
      email: "head@example.com",
      password: "password",
      expectedRole: "ENGINEER",
    }).expect(403);

    expect(response.body.code).toBe("ROLE_MISMATCH");
    expect(response.body.accessToken).toBeUndefined();
  });

  it("does not accept citizen accounts through internal login", async () => {
    findUnique.mockResolvedValue({
      id: "citizen-1",
      role: "CITIZEN",
      email: "citizen@example.com",
      passwordHash: "hash",
    });

    await request(app).post("/auth/internal/login").send({
      email: "citizen@example.com",
      password: "password",
      expectedRole: "PROJECT_HEAD",
    }).expect(401);
  });
});
