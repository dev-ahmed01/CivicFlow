import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ getItemAsync: vi.fn(async () => null), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
vi.mock("expo-secure-store", () => store);
vi.mock("expo-file-system/legacy", () => ({}));
import { clearInternalSession, internalLogin, loadEngineerProjects, loadMyTickets, startDemoGuestSession } from "./api";

describe("mobile login and collection contracts", () => {
  beforeEach(async () => { await clearInternalSession(); vi.clearAllMocks(); });
  it("enters the citizen demo using a guest session without OTP or phone", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: { id: "guest", role: "CITIZEN", phone: null },
      accessToken: "access", refreshToken: "refresh",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const auth = await startDemoGuestSession();
    expect(auth.role).toBe("CITIZEN");
    expect(auth.userId).toBe("guest");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toContain("/auth/citizen/demo-guest");
    expect(store.setItemAsync).toHaveBeenCalledTimes(1);
  });
  it("signs in with one API request and one secure write, without a profile request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { id: "engineer", role: "ENGINEER", agencyId: "roads" }, accessToken: "access", refreshToken: "refresh", requiresPasswordReset: false })));
    vi.stubGlobal("fetch", fetcher);
    expect((await internalLogin("engineer@demo.local", "password")).userId).toBe("engineer");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.setItemAsync).toHaveBeenCalledTimes(1);
  });
  it("does not refresh and retry failed login credentials even with an existing session", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "engineer", role: "ENGINEER", agencyId: "roads" }, accessToken: "access", refreshToken: "refresh", requiresPasswordReset: false }))).mockResolvedValue(new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401 }));
    vi.stubGlobal("fetch", fetcher);
    await internalLogin("engineer@demo.local", "password");
    await expect(internalLogin("engineer@demo.local", "wrong")).rejects.toThrow("Invalid email or password");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["projects", "tickets"])("loads the full %s collection before displaying a total", async (key) => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify({ [key]: [{ id: `page-${page}` }], pagination: { page, limit: 50, total: 2, totalPages: 2 } }));
    });
    vi.stubGlobal("fetch", fetcher);
    const result = key === "projects" ? await loadEngineerProjects("mine") : await loadMyTickets("ongoing");
    expect(result).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
