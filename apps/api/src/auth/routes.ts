import type { Request, Response } from "express";
import { Router } from "express";
import bcrypt from "bcrypt";
import {
  internalLoginSchema,
  refreshTokenRequestSchema,
  requestOtpSchema,
  resetPasswordSchema,
  userRoleSchema,
  verifyOtpSchema,
} from "@civicos/shared";
import { prisma, UserRole } from "db";
import type { OtpProvider } from "./otp-provider";
import { requestCitizenOtp, verifyCitizenOtp } from "./otp-service";
import { requireAuth, requireRole } from "./middleware";
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
      response.status(202).json({ message: "If the number is eligible, an OTP was sent" });
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
