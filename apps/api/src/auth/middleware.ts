import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@civicos/shared";
import { prisma } from "db";
import { verifyAccessToken } from "./tokens";

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
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const claims = verifyAccessToken(authorization.slice("Bearer ".length));
    void prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, agencyId: true, wardId: true, mustResetPassword: true },
    }).then((user) => {
      if (!user) {
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
