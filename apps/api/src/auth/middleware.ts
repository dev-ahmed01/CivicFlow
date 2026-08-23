import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@civicos/shared";
import { verifyAccessToken } from "./tokens";

export function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const authorization = request.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const claims = verifyAccessToken(authorization.slice("Bearer ".length));
    request.auth = {
      userId: claims.sub,
      role: claims.role,
      agencyId: claims.agencyId,
      wardId: claims.wardId,
      mustResetPassword: claims.mustResetPassword,
    };
    next();
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
