import type { ImageRelevanceCheck, LocalImage } from "./api";

export function photoRejectionMessage(reason: ImageRelevanceCheck["reason"]): string {
  if (reason === "UNRELATED_CONTENT") return "Screenshots and unrelated images are not accepted. Please upload a real photo of the civic issue.";
  if (reason === "CATEGORY_MISMATCH") return "Please upload a real photo of the civic issue or public-area scene.";
  return "Please upload a clear, readable photo of the civic issue.";
}

export function nextScreenAfterPhotoCheck(result: ImageRelevanceCheck): "location-detect" | "feedback" {
  return result.relevant && Boolean(result.validationToken) ? "location-detect" : "feedback";
}

export function primaryEvidence(images: LocalImage[]): LocalImage | undefined {
  return images[0];
}
