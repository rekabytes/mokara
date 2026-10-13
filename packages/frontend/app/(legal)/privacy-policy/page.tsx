import { getPublicMetadata } from "@/lib/seo.server";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { LEGAL_DOCS } from "@/lib/legal-links";

import { SECTIONS } from "./sections";

export function generateMetadata(): Metadata {
  return getPublicMetadata("/privacy-policy");
}

// Written against the code, not a template: every claim below maps to something
// that actually exists in packages/backend/src (schema, cookies.ts,
// request-log.ts) or to something deliberately absent (no email field, no
// third-party scripts, no client-side storage).

export default function PrivacyPolicyPage() {
  return <LegalDoc meta={LEGAL_DOCS.privacy} sections={SECTIONS} also={["terms", "cookies"]} />;
}
