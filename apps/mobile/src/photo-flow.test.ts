import { describe, expect, it } from "vitest";
import type { LocalImage } from "./api";
import { nextScreenAfterPhotoCheck, photoRejectionMessage, primaryEvidence } from "./photo-flow";

const accepted = { relevant: true, confidence: 0.95, reason: "MATCH" as const, attemptsRemaining: 2, validationToken: "validated" };

describe("citizen photo flow", () => {
  it("lets a camera-uploaded valid primary photo proceed to GPS", () => {
    const image: LocalImage = { uri: "file://camera/IMG_1234.jpg", fileName: "IMG_1234.jpg", contentType: "image/jpeg" };
    expect(primaryEvidence([image])).toBe(image);
    expect(nextScreenAfterPhotoCheck(accepted)).toBe("location-detect");
  });

  it("lets a gallery-uploaded valid primary photo proceed to GPS", () => {
    const image: LocalImage = { uri: "content://gallery/gallery-image.jpg", fileName: "gallery-image.jpg", contentType: "image/jpeg" };
    expect(primaryEvidence([image])).toBe(image);
    expect(nextScreenAfterPhotoCheck(accepted)).toBe("location-detect");
  });

  it("keeps the first of multiple photos as primary evidence", () => {
    const images: LocalImage[] = [
      { uri: "content://camera/primary.jpg", fileName: "camera-primary.jpg", contentType: "image/jpeg" },
      { uri: "content://gallery/supporting.jpg", fileName: "supporting.jpg", contentType: "image/jpeg" },
    ];
    expect(primaryEvidence(images)).toBe(images[0]);
  });

  it("keeps rejected evidence in the recoverable photo step", () => {
    expect(nextScreenAfterPhotoCheck({ relevant: false, confidence: 0.02, reason: "UNRELATED_CONTENT", attemptsRemaining: 2 })).toBe("feedback");
    expect(photoRejectionMessage("UNRELATED_CONTENT")).toContain("Screenshots");
  });
});
