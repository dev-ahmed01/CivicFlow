import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function parsePagination(query: { page?: unknown; limit?: unknown }) {
  const parsed = paginationSchema.safeParse({ page: query.page, limit: query.limit });
  if (!parsed.success) return parsed;
  return {
    ...parsed,
    data: { ...parsed.data, skip: (parsed.data.page - 1) * parsed.data.limit },
  };
}

export function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
