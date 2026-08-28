import jwt from "jsonwebtoken";

export type ValidatedImageClaims = {
  userId: string;
  categoryId: string;
  objectKey: string;
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/heic";
};

const issuer = "civicos-api";
const audience = "civicos-image-relevance";

export function issueValidatedImageToken(secret: string, claims: ValidatedImageClaims): string {
  return jwt.sign(
    { categoryId: claims.categoryId, objectKey: claims.objectKey, fileName: claims.fileName, contentType: claims.contentType },
    secret,
    { subject: claims.userId, issuer, audience, expiresIn: "15m" },
  );
}

export function verifyValidatedImageToken(secret: string, token: string): ValidatedImageClaims {
  const decoded = jwt.verify(token, secret, { issuer, audience });
  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.categoryId !== "string" ||
    typeof decoded.objectKey !== "string" ||
    typeof decoded.fileName !== "string" ||
    !["image/jpeg", "image/png", "image/webp", "image/heic"].includes(String(decoded.contentType))
  ) throw new Error("Invalid image validation token");
  return {
    userId: decoded.sub,
    categoryId: decoded.categoryId,
    objectKey: decoded.objectKey,
    fileName: decoded.fileName,
    contentType: decoded.contentType as ValidatedImageClaims["contentType"],
  };
}
