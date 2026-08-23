import request from "supertest";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => vi.restoreAllMocks());

  it("returns reverse-chronological user rows and the authoritative unread count", async () => {
    const createdAt = new Date("2026-08-23T10:00:00.000Z");
    const row = { id: "60000000-0000-4000-8000-000000000091", userId, type: "CONFLICT_DETECTED", payload: { severity: "HIGH" }, read: false, createdAt };
    const findMany = vi.spyOn(prisma.notification, "findMany").mockResolvedValue([row]);
    vi.spyOn(prisma.notification, "count").mockResolvedValue(1);
    const response = await request(app).get("/notifications?unread=true").set("Authorization", `Bearer ${accessToken()}`).expect(200);
    expect(response.body.unreadCount).toBe(1);
    expect(response.body.notifications[0].type).toBe("CONFLICT_DETECTED");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId, read: false } }));
  });

  it("marks only the authenticated user's notification as read", async () => {
    const updateMany = vi.spyOn(prisma.notification, "updateMany").mockResolvedValue({ count: 1 });
    const notificationId = "60000000-0000-4000-8000-000000000092";
    await request(app).patch(`/notifications/${notificationId}/read`).set("Authorization", `Bearer ${accessToken()}`).expect(200);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: notificationId, userId }, data: { read: true } });
  });

  it("requires authentication", async () => {
    await request(app).get("/notifications").expect(401);
  });
});
