import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExpoPushMessage, ExpoPushGateway } from "./service";

describe("Expo notification delivery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("builds a navigable Expo message from the notification row", () => {
    const message = buildExpoPushMessage({
      token: "ExpoPushToken[device-1]",
      notification: { id: "notification-1", type: "PROJECT_ASSIGNMENT", payload: { projectId: "project-1" } },
    });
    expect(message.to).toBe("ExpoPushToken[device-1]");
    expect(message.body).toContain("assigned");
    expect(message.data).toEqual({ notificationId: "notification-1", type: "PROJECT_ASSIGNMENT", projectId: "project-1" });
  });

  it("posts messages to the Expo push API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: "ok", id: "receipt-1" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new ExpoPushGateway("expo-secret");
    const result = await gateway.send([{ to: "ExpoPushToken[device-1]", sound: "default", title: "City Connect", body: "Update", data: {} }]);
    expect(result).toEqual([{ status: "ok", id: "receipt-1" }]);
    expect(fetchMock).toHaveBeenCalledWith("https://exp.host/--/api/v2/push/send", expect.objectContaining({ method: "POST" }));
  });
});
