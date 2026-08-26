import { Channel } from "db";
import { describe, expect, it } from "vitest";
import { imageCompletionDecision, webAutoRoutingEnabled } from "./web-routing-policy";

describe("web ticket routing policy", () => {
  it("enables the differentiated flow only for configured web demo/local reports", () => {
    expect(webAutoRoutingEnabled(Channel.WEB, "local", true)).toBe(true);
    expect(webAutoRoutingEnabled(Channel.WEB, "free_demo", true)).toBe(true);
    expect(webAutoRoutingEnabled(Channel.MOBILE, "free_demo", true)).toBe(false);
    expect(webAutoRoutingEnabled(Channel.WEB, "free_demo", false)).toBe(false);
    expect(webAutoRoutingEnabled(Channel.WEB, "production", true)).toBe(false);
  });

  it("routes a clean web pass directly and never sends a failed web image onward", () => {
    expect(imageCompletionDecision({ relevancePassed: true, directWebFlow: true, attempt: 1, maxRetries: 3 })).toBe("DIRECT_AGENCY");
    expect(imageCompletionDecision({ relevancePassed: false, directWebFlow: true, attempt: 3, maxRetries: 3 })).toBe("RETAKE");
    expect(imageCompletionDecision({ relevancePassed: false, directWebFlow: true, attempt: 20, maxRetries: 3 })).toBe("RETAKE");
  });

  it("preserves community validation for mobile and for web when the demo flag is off", () => {
    expect(imageCompletionDecision({ relevancePassed: true, directWebFlow: false, attempt: 1, maxRetries: 3 })).toBe("COMMUNITY_VALIDATION");
    expect(imageCompletionDecision({ relevancePassed: false, directWebFlow: false, attempt: 3, maxRetries: 3 })).toBe("COMMUNITY_VALIDATION");
  });
});
