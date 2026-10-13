import { getSitemap } from "@/lib/seo.server";

// Resolve deployment settings when requested, not when the image is built.
export const dynamic = "force-dynamic";

export default function sitemap() {
  return getSitemap();
}
