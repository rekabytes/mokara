import { z } from "zod";

export const changelogSchema = z.object({
  releases: z.array(
    z.object({
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      date: z.iso.date(),
      title: z.string().min(1),
      summary: z.string().min(1),
      changes: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1),
    })
  ),
});
export type Release = z.infer<typeof changelogSchema>["releases"][number];
export const dismissedReleasesSchema = z.record(z.string(), z.string());
export function isDismissedReleases(value: unknown): value is Record<string, string> {
  return dismissedReleasesSchema.safeParse(value).success;
}
export function hasNewRelease(dismissed: Record<string, string>, userId: string, version: string) {
  return !Object.hasOwn(dismissed, userId) || dismissed[userId] !== version;
}
