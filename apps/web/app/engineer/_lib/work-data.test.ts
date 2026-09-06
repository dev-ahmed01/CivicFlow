import { beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "./api";
import { loadWorkStage } from "./work-data";

vi.mock("./api", () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it("loads every page of a lifecycle so counts do not stop at 50", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce({ projects: [{ id: "first" }], pagination: { totalPages: 2 } }).mockResolvedValueOnce({ projects: [{ id: "last" }], pagination: { totalPages: 2 } });
  expect(await loadWorkStage("completed")).toEqual([{ id: "first" }, { id: "last" }]);
  expect(apiFetch).toHaveBeenNthCalledWith(1, "/projects?scope=mine&limit=50&stage=completed&page=1");
  expect(apiFetch).toHaveBeenNthCalledWith(2, "/projects?scope=mine&limit=50&stage=completed&page=2");
});

it("preserves the assignment API scope instead of treating Assigned as a stage", async () => {
  vi.mocked(apiFetch).mockResolvedValue({ projects: [], pagination: { totalPages: 1 } });
  await loadWorkStage("assigned");
  expect(apiFetch).toHaveBeenCalledWith("/projects?scope=assigned&limit=50&page=1");
});
