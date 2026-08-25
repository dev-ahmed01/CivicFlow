import type { Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcrypt";
import {
  internalLoginSchema,
  refreshTokenRequestSchema,
  requestOtpSchema,
  resetPasswordSchema,
  totpCodeSchema,
  userRoleSchema,
  verifyOtpSchema,
} from "@civicos/shared";
import { prisma, UserRole } from "db";
import type { OtpProvider } from "./otp-provider";
import { requestCitizenOtp, verifyCitizenOtp } from "./otp-service";
import { requireAuth, requireRole } from "./middleware";
import { requirePasswordResetComplete } from "./middleware";
import { createTotpSecret, totpUri, verifyTotp } from "./totp";
import { getEnv } from "../config/env";
import {
  issueTokens,
  revokeRefreshToken,
  rotateRefreshToken,
} from "./tokens";

export function createAuthRouter(otpProvider: OtpProvider): Router {
  const router = Router();

  router.post("/citizen/request-otp", async (request: Request, response: Response) => {
    const parsed = requestOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
      return;
    }

    try {
      await requestCitizenOtp(parsed.data.phone, otpProvider);
      const demoMode = getEnv().DEMO_AUTH_MODE === "fixed_otp";
      response.status(202).json({
        message: demoMode ? "Demo authentication is active; enter the rehearsal code supplied by the presenter" : "If the number is eligible, an OTP was sent",
        demoMode,
      });
    } catch (error) {
      console.error(error);
      response.status(500).json({ error: "Unable to send OTP" });
    }
  });

  router.post("/citizen/verify-otp", async (request: Request, response: Response) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
      return;
    }

    try {
      const result = await verifyCitizenOtp(parsed.data.phone, parsed.data.code);
      response.json({
        user: {
          id: result.user.id,
          role: result.user.role,
          phone: result.user.phone,
        },
        ...result.tokens,
      });
    } catch {
      response.status(401).json({ error: "Invalid or expired OTP" });
    }
  });

  router.post("/internal/login", async (request: Request, response: Response) => {
    const parsed = internalLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });
    if (
      !user ||
      user.role === UserRole.CITIZEN ||
      !user.passwordHash ||
      !(await bcrypt.compare(parsed.data.password, user.passwordHash))
    ) {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Part III §17.2 — role-specific portals must not mint a usable session for
    // a different internal role. The client check remains defence in depth.
    if (parsed.data.expectedRole && user.role !== parsed.data.expectedRole) {
      response.status(403).json({ error: "This account does not have access to the selected workspace", code: "ROLE_MISMATCH" });
      return;
    }

    // Part III §17.1 — Admin accounts may require a second TOTP factor.
    if (user.role === UserRole.ADMIN && user.totpEnabled) {
      if (!parsed.data.totpCode) {
        response.status(401).json({ error: "Authenticator code required", code: "TOTP_REQUIRED" });
        return;
      }
      if (!user.totpSecret || !verifyTotp(user.totpSecret, parsed.data.totpCode)) {
        response.status(401).json({ error: "Invalid authenticator code", code: "TOTP_INVALID" });
        return;
      }
    }

    response.json({
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        agencyId: user.agencyId,
      },
      requiresPasswordReset: user.mustResetPassword,
      ...(await issueTokens(user)),
    });
  });

  router.post("/refresh", async (request: Request, response: Response) => {
    const parsed = refreshTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request" });
      return;
    }
    try {
      response.json(await rotateRefreshToken(parsed.data.refreshToken));
    } catch {
      response.status(401).json({ error: "Invalid or expired refresh token" });
    }
  });

  router.post(
    "/internal/reset-password",
    requireAuth,
    requireRole(UserRole.PROJECT_HEAD, UserRole.ENGINEER, UserRole.ADMIN),
    async (request: Request, response: Response) => {
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success || !request.auth) {
        response.status(400).json({ error: "Invalid request", issues: parsed.success ? [] : parsed.error.issues });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: request.auth.userId } });
      if (
        !user?.passwordHash ||
        !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))
      ) {
        response.status(401).json({ error: "Current password is invalid" });
        return;
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
            mustResetPassword: false,
          },
        }),
        prisma.refreshSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      response.status(204).send();
    },
  );

  router.post(
    "/internal/totp/setup",
    requireAuth,
    requireRole(UserRole.ADMIN),
    requirePasswordResetComplete,
    async (request: Request, response: Response) => {
      const user = await prisma.user.findUnique({ where: { id: request.auth!.userId }, select: { email: true, totpEnabled: true } });
      if (!user?.email) {
        response.status(404).json({ error: "Admin account not found" });
        return;
      }
      if (user.totpEnabled) {
        response.status(409).json({ error: "TOTP is already enabled" });
        return;
      }
      const secret = createTotpSecret();
      await prisma.user.update({ where: { id: request.auth!.userId }, data: { totpSecret: secret, totpEnabled: false } });
      response.json({ secret, otpauthUrl: totpUri(secret, user.email) });
    },
  );

  router.post(
    "/internal/totp/enable",
    requireAuth,
    requireRole(UserRole.ADMIN),
    requirePasswordResetComplete,
    async (request: Request, response: Response) => {
      const parsed = totpCodeSchema.safeParse(request.body);
      const user = await prisma.user.findUnique({ where: { id: request.auth!.userId }, select: { totpSecret: true } });
      if (!parsed.success || !user?.totpSecret || !verifyTotp(user.totpSecret, parsed.data.code)) {
        response.status(400).json({ error: "Invalid authenticator code" });
        return;
      }
      await prisma.user.update({ where: { id: request.auth!.userId }, data: { totpEnabled: true } });
      response.json({ enabled: true });
    },
  );

  router.delete(
    "/internal/totp",
    requireAuth,
    requireRole(UserRole.ADMIN),
    requirePasswordResetComplete,
    async (request: Request, response: Response) => {
      const parsed = totpCodeSchema.safeParse(request.body);
      const user = await prisma.user.findUnique({ where: { id: request.auth!.userId }, select: { totpSecret: true, totpEnabled: true } });
      if (!user || user.totpEnabled && (!parsed.success || !user.totpSecret || !verifyTotp(user.totpSecret, parsed.data.code))) {
        response.status(400).json({ error: "Valid authenticator code required" });
        return;
      }
      await prisma.user.update({ where: { id: request.auth!.userId }, data: { totpEnabled: false, totpSecret: null } });
      response.status(204).send();
    },
  );

  router.post(
    "/logout",
    requireAuth,
    requireRole(...userRoleSchema.options),
    async (request: Request, response: Response) => {
      const parsed = refreshTokenRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ error: "Invalid request" });
        return;
      }
      await revokeRefreshToken(parsed.data.refreshToken);
      response.status(204).send();
    },
  );

  return router;
}
