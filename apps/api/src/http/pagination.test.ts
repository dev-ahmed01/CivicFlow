import { describe, expect, it } from "vitest";
import { paginationMeta, parsePagination } from "./pagination";

describe("pagination", () => {
  it("uses a bounded demo-safe default", () => {
    const parsed = parsePagination({});
    expect(parsed.success && parsed.data).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it("calculates offsets and rejects limits above 50", () => {
    const parsed = parsePagination({ page: "3", limit: "20" });
    expect(parsed.success && parsed.data.skip).toBe(40);
    expect(parsePagination({ limit: "51" }).success).toBe(false);
    expect(paginationMeta(3, 20, 45)).toEqual({ page: 3, limit: 20, total: 45, totalPages: 3 });
  });
});
