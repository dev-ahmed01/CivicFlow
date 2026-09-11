import { describe, expect, it } from "vitest";
import { completionEvidenceRequestSchema, planningPhotoUploadSchema, reviewInspectionSchema, submitInspectionSchema } from "./schemas";

describe("evidence and optional descriptions", () => {
  it("accepts a completion photo without notes and stores empty notes", () => {
    expect(completionEvidenceRequestSchema.parse({ action: "presign", fileName: "site.jpg", contentType: "image/jpeg" })).toMatchObject({ notes: "" });
  });
  it("requires an image and rejects PDF completion/planning photos", () => {
    expect(completionEvidenceRequestSchema.safeParse({ action: "presign", notes: "Done" }).success).toBe(false);
    for (const schema of [completionEvidenceRequestSchema, planningPhotoUploadSchema]) expect(schema.safeParse({ action: "presign", fileName: "report.pdf", contentType: "application/pdf" }).success).toBe(false);
  });
  it("keeps production inspection assessment strict and allows a review decision without prose", () => {
    expect(submitInspectionSchema.safeParse({}).success).toBe(false);
    expect(reviewInspectionSchema.parse({ decision: "CREATE_WORK" }).note).toBe("");
  });
});
