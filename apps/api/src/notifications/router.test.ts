import request from "supertest";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "db";
import { createApp } from "../app";
import type { OtpProvider } from "../auth/otp-provider";

const accessSecret = "test-access-secret-that-is-at-least-32-characters";
const userId = "40000000-0000-4000-8000-000000000091";
process.env.DATABASE_URL = "postgresql://unused:unused@localhost:5432/unused";
process.env.JWT_ACCESS_SECRET = accessSecret;
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-that-is-at-least-32-characters";

const noopOtpProvider: OtpProvider = { async sendOtp() {} };
const app = createApp(noopOtpProvider);

function accessToken() {
  return jwt.sign(
    { role: "ENGINEER", agencyId: "50000000-0000-4000-8000-000000000091", wardId: null, mustResetPassword: false, tokenType: "access" },
    accessSecret,
    { subject: userId, expiresIn: "15m", issuer: "civicos-api", audience: "civicos-clients" },
  );
}

describe("notification API", () => {
  beforeEach(() => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: userId,
      role: "ENGINEER",
      agencyId: "50000000-0000-4000-8000-000000000091",
      wardId: null,
      mustResetPassword: false,
    } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the authoritative unread count without sending notification rows to polling clients", async () => {
    const findMany = vi.spyOn(prisma.notification, "findMany");
    vi.spyOn(prisma.notification, "count").mockResolvedValue(1);
    const response = await request(app).get("/notifications?unread=true").set("Authorization", `Bearer ${accessToken()}`).expect(200);
    expect(response.body.unreadCount).toBe(1);
    expect(response.body.notifications).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("paginates reverse-chronological notification rows at a maximum of 50", async () => {
    const createdAt = new Date("2026-08-23T10:00:00.000Z");
    const row = { id: "60000000-0000-4000-8000-000000000091", userId, type: "CONFLICT_DETECTED", payload: { severity: "HIGH" }, read: false, createdAt };
    const findMany = vi.spyOn(prisma.notification, "findMany").mockResolvedValue([row]);
    vi.spyOn(prisma.notification, "count").mockResolvedValueOnce(21).mockResolvedValueOnce(1);
    const response = await request(app).get("/notifications?page=2&limit=20").set("Authorization", `Bearer ${accessToken()}`).expect(200);
    expect(response.body.pagination).toEqual({ page: 2, limit: 20, total: 21, totalPages: 2 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId }, skip: 20, take: 20 }));
  });

  it("marks only the authenticated user's notification as read", async () => {
    const updateMany = vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 1 });
    const notificationId = "60000000-0000-4000-8000-000000000092";
    await request(app).patch(`/notifications/${notificationId}/read`).set("Authorization", `Bearer ${accessToken()}`).expect(200);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: notificationId, userId }, data: { read: true } });
  });

  it("marks a bounded set of visible notifications in one write", async () => {
    const updateMany = vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 2 });
    const ids = ["60000000-0000-4000-8000-000000000092", "60000000-0000-4000-8000-000000000093"];
    await request(app).patch("/notifications/read").set("Authorization", `Bearer ${accessToken()}`).send({ ids }).expect(200);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ids }, userId, read: false }, data: { read: true } });
  });

  it("requires authentication", async () => {
    await request(app).get("/notifications").expect(401);
  });
});
