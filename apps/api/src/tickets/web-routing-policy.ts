import type { Channel } from "db";

export type DeploymentProfile = "local" | "free_demo" | "production";
export type ImageCompletionDecision = "RETAKE" | "COMMUNITY_VALIDATION" | "DIRECT_AGENCY";

export function webAutoRoutingEnabled(
  channel: Channel,
  deploymentProfile: DeploymentProfile,
  configured: boolean,
): boolean {
  if (channel !== "WEB" || !configured) return false;
  // This differentiator is allowed in local/demo environments only. A real
  // production profile can never activate it, even if its config is changed.
  return deploymentProfile === "local" || deploymentProfile === "free_demo";
}

export function imageCompletionDecision(input: {
  relevancePassed: boolean;
  directWebFlow: boolean;
  attempt: number;
  maxRetries: number;
}): ImageCompletionDecision {
  if (!input.relevancePassed && (input.directWebFlow || input.attempt < input.maxRetries)) return "RETAKE";
  if (input.relevancePassed && input.directWebFlow) return "DIRECT_AGENCY";
  return "COMMUNITY_VALIDATION";
}
