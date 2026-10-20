import { z } from "zod";

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export function page<T>(items: T[], limit: number, offset: number) {
  // Callers fetch limit + 1 rows to know whether another page exists
  const hasMore = items.length > limit;
  return {
    items: hasMore ? items.slice(0, limit) : items,
    nextOffset: hasMore ? offset + limit : null,
  };
}
