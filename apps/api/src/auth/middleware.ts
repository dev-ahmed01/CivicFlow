import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@civicos/shared";
import { prisma } from "db";
import { verifyAccessToken } from "./tokens";

const presignS3EnvKeys = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_BASE_URL"] as const;

function isFreeDemoPresign(request: Request): boolean {
  return process.env.DEPLOYMENT_PROFILE === "free_demo"
    && request.method === "POST"
    && request.path === "/tickets/image-relevance"
    && request.body?.action === "presign";
}

function presignAuthFailure(request: Request, response: Response, error: string, code: string): boolean {
  if (!isFreeDemoPresign(request)) return false;
  console.warn("[tickets.image-relevance.presign] failed", {
    userId: request.auth?.userId ?? null,
    role: request.auth?.role ?? null,
    contentType: typeof request.body?.contentType === "string" ? request.body.contentType : null,
    status: code === "PRESIGN_ROLE_FORBIDDEN" ? 403 : 401,
    failurePhase: "authentication",
    s3EnvPresent: Object.fromEntries(presignS3EnvKeys.map((key) => [key, Boolean(process.env[key]?.trim())])),
  });
  response.status(code === "PRESIGN_ROLE_FORBIDDEN" ? 403 : 401).json({ error, code, diagnostic: "free_demo" });
  return true;
}

export function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.auth) {
    next();
    return;
  }
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    if (presignAuthFailure(request, response, "Authentication required", "PRESIGN_AUTH_REQUIRED")) return;
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const claims = verifyAccessToken(authorization.slice("Bearer ".length));
    void prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, agencyId: true, wardId: true, mustResetPassword: true, deactivatedAt: true },
    }).then((user) => {
      if (!user || user.deactivatedAt) {
        if (presignAuthFailure(request, response, "Account is no longer active", "PRESIGN_ACCOUNT_INACTIVE")) return;
        response.status(401).json({ error: "Account is no longer active" });
        return;
      }
      // Part III §17.2 — the signed token proves the session identity; current
      // role, agency, ward, and reset state remain database-authoritative.
      request.auth = {
        userId: user.id,
        role: user.role,
        agencyId: user.agencyId,
        wardId: user.wardId,
        mustResetPassword: user.mustResetPassword,
      };
      next();
    }).catch(next);
  } catch {
    if (presignAuthFailure(request, response, "Invalid or expired access token", "PRESIGN_ACCESS_TOKEN_INVALID")) return;
    response.status(401).json({ error: "Invalid or expired access token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!request.auth) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(request.auth.role)) {
      if (presignAuthFailure(request, response, "Insufficient role", "PRESIGN_ROLE_FORBIDDEN")) return;
      response.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
}

export function requirePasswordResetComplete(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!request.auth) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  if (request.auth.mustResetPassword) {
    response.status(403).json({
      error: "Password reset required",
      code: "PASSWORD_RESET_REQUIRED",
    });
    return;
  }
  next();
}
