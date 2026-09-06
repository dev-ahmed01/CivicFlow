import { afterEach, describe, expect, it, vi } from "vitest";
import { hasEngineerHistory, queryPage, trackEngineerHistory } from "./navigation";

afterEach(() => vi.unstubAllGlobals());

describe("Engineer history provenance", () => {
  it("uses the logical parent for a direct entry even with external browser history", () => {
    vi.stubGlobal("window", { history: { length: 12, state: { __NA: true } } });
    expect(hasEngineerHistory()).toBe(false);
  });

  it("preserves Next state and in-app provenance across push, replace and Back", () => {
    const entries: Record<string, unknown>[] = [{ __NA: true, tree: "map" }];
    let index = 0;
    const history = {
      get state() { return entries[index]; },
      pushState(data: Record<string, unknown>) { entries[++index] = data; },
      replaceState(data: Record<string, unknown>) { entries[index] = data; },
    };
    vi.stubGlobal("window", { history, location: { pathname: "/engineer/map" } });
    const cleanup = trackEngineerHistory();
    history.replaceState({ __NA: true, tree: "map-list-open" });
    expect(hasEngineerHistory()).toBe(false);
    history.pushState({ __NA: true, tree: "detail" });
    expect(hasEngineerHistory()).toBe(true);
    history.replaceState({ __NA: true, tree: "detail-updated" });
    expect(history.state).toMatchObject({ __NA: true, tree: "detail-updated" });
    expect(hasEngineerHistory()).toBe(true);
    index--;
    expect(hasEngineerHistory()).toBe(false);
    expect(history.state?.tree).toBe("map-list-open");
    cleanup();
  });

  it("does not treat the login page as an Engineer workflow origin", () => {
    const history = { state: {}, pushState(data: object) { this.state = data; }, replaceState(data: object) { this.state = data; } };
    vi.stubGlobal("window", { history, location: { pathname: "/engineer/login" } });
    const cleanup = trackEngineerHistory();
    history.pushState({ __NA: true });
    expect(hasEngineerHistory()).toBe(false);
    cleanup();
  });

  it("normalizes invalid URL pages", () => {
    for (const value of [null, "0", "-2", "1.5", "NaN", "Infinity"]) expect(queryPage(value)).toBe(1);
    expect(queryPage("3")).toBe(3);
  });
});
