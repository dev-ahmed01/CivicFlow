import { createHash, randomUUID } from "node:crypto";
import { prisma, type User } from "db";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { getEnv } from "../config/env";

type TokenUser = Pick<
  User,
  "id" | "role" | "agencyId" | "wardId" | "mustResetPassword"
>;

export interface AccessClaims extends JwtPayload {
  sub: string;
  role: User["role"];
  agencyId: string | null;
  wardId: string | null;
  mustResetPassword: boolean;
  tokenType: "access";
}

interface RefreshClaims extends JwtPayload {
  sub: string;
  role: User["role"];
  tokenType: "refresh";
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expirationDate(token: string): Date {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string" || !decoded.exp) {
    throw new Error("Issued refresh token did not contain an expiry");
  }
  return new Date(decoded.exp * 1000);
}

export async function issueTokens(user: TokenUser) {
  const env = getEnv();
  const accessToken = jwt.sign(
    {
      role: user.role,
      agencyId: user.agencyId,
      wardId: user.wardId,
      mustResetPassword: user.mustResetPassword,
      tokenType: "access",
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: user.id,
      expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"],
      issuer: "civicos-api",
      audience: "civicos-clients",
    },
  );

  const refreshToken = jwt.sign(
    { role: user.role, tokenType: "refresh" },
    env.JWT_REFRESH_SECRET,
    {
      subject: user.id,
      jwtid: randomUUID(),
      expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"],
      issuer: "civicos-api",
      audience: "civicos-refresh",
    },
  );

  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: tokenHash(refreshToken),
      expiresAt: expirationDate(refreshToken),
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: env.JWT_ACCESS_TTL,
  };
}

export function verifyAccessToken(token: string): AccessClaims {
  const env = getEnv();
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "civicos-api",
    audience: "civicos-clients",
  });

  if (
    typeof decoded === "string" ||
    decoded.tokenType !== "access" ||
    typeof decoded.sub !== "string"
  ) {
    throw new Error("Invalid access token claims");
  }

  return decoded as AccessClaims;
}

export async function rotateRefreshToken(refreshToken: string) {
  const env = getEnv();
  const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
    issuer: "civicos-api",
    audience: "civicos-refresh",
  });

  if (
    typeof decoded === "string" ||
    decoded.tokenType !== "refresh" ||
    typeof decoded.sub !== "string"
  ) {
    throw new Error("Invalid refresh token claims");
  }

  const refreshClaims = decoded as RefreshClaims;
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: tokenHash(refreshToken) },
    include: { user: true },
  });

  if (
    !session ||
    session.userId !== refreshClaims.sub ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  ) {
    throw new Error("Refresh session is expired or revoked");
  }

  await prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(session.user);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: { tokenHash: tokenHash(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
