import type { PaginationMeta } from "./schemas";

/** Load a complete collection before applying local filters or displaying totals. */
export async function collectPages<T>(load: (page: number) => Promise<{ items: T[]; pagination?: PaginationMeta }>): Promise<T[]> {
  const first = await load(1);
  const items = [...first.items];
  for (let page = 2; page <= (first.pagination?.totalPages ?? 1); page++) items.push(...(await load(page)).items);
  return items;
}
