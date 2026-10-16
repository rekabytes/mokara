import { z } from "zod";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  cursor: z.string().min(1).max(512).optional(),
});
const cursorSchema = z.tuple([z.string(), z.iso.datetime(), z.uuid()]);

export function collectionPage(query: Record<string, string>, scope: string) {
  const parsed = querySchema.safeParse(query);
  if (!parsed.success) return null;
  if (!parsed.data.cursor) return { limit: parsed.data.limit, cursor: null };
  const raw = parsed.data.cursor;
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.toString("base64url") !== raw) return null;
    const cursor = cursorSchema.safeParse(JSON.parse(decoded.toString("utf8")));
    if (!cursor.success || cursor.data[0] !== scope) return null;
    return {
      limit: parsed.data.limit,
      cursor: { createdAt: new Date(cursor.data[1]), id: cursor.data[2] },
    };
  } catch {
    return null;
  }
}

export function collectionCursor(scope: string, row: { createdAt: Date; id: string }) {
  return Buffer.from(JSON.stringify([scope, row.createdAt.toISOString(), row.id])).toString(
    "base64url"
  );
}

export function collectionAfter(
  cursor: { createdAt: Date; id: string } | null,
  direction: "asc" | "desc"
) {
  if (!cursor) return {};
  return direction === "asc"
    ? {
        OR: [
          { createdAt: { gt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { gt: cursor.id } },
        ],
      }
    : {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
}
