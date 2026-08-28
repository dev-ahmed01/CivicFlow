import { describe, expect, it } from "vitest";
import { issueValidatedImageToken, verifyValidatedImageToken } from "./validation-token";

const secret = "image-validation-secret-that-is-at-least-32-characters";

describe("validated image token", () => {
  it("binds a passing upload to its citizen and selected category", () => {
    const claims = {
      userId: "40000000-0000-4000-8000-000000000001",
      categoryId: "30000000-0000-4000-8000-000000000001",
      objectKey: "preflight/40000000-0000-4000-8000-000000000001/photo-pothole.jpg",
      fileName: "photo-pothole.jpg",
      contentType: "image/jpeg" as const,
    };
    expect(verifyValidatedImageToken(secret, issueValidatedImageToken(secret, claims))).toEqual(claims);
  });

  it("rejects a token signed by another service", () => {
    const token = issueValidatedImageToken(`${secret}-other`, {
      userId: "citizen",
      categoryId: "category",
      objectKey: "preflight/citizen/photo.jpg",
      fileName: "photo.jpg",
      contentType: "image/jpeg",
    });
    expect(() => verifyValidatedImageToken(secret, token)).toThrow();
  });
});
