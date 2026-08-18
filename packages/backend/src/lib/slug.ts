const FORBIDDEN = /[^a-z0-9]+/g;

export function slugify(name: string): string {
  let s = name.toLowerCase().trim();
  s = s.replace(FORBIDDEN, "-").replace(/^-+|-+$/g, "");
  if (s.length > 50) s = s.slice(0, 50);
  if (!s) s = "team";
  return s;
}

// `exists` is injected to keep this module free of DB deps. Caller passes a
// Prisma-backed predicate.
export async function ensureUniqueSlug(
  exists: (slug: string) => Promise<boolean>,
  base: string
): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 50; i++) {
    if (!(await exists(candidate))) return candidate;
    candidate = i === 0 ? `${base}-2` : `${base}-${i + 2}`;
  }
  throw new Error("could not generate unique slug");
}
