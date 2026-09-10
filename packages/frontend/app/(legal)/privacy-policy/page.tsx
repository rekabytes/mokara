import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { LEGAL_DOCS } from "@/lib/legal";

import { SECTIONS } from "./sections";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: LEGAL_DOCS.privacy.description,
};

// Written against the code, not a template: every claim below maps to something
// that actually exists in packages/backend/src (schema, cookies.ts,
// request-log.ts) or to something deliberately absent (no email field, no
// third-party scripts, no client-side storage).

export default function PrivacyPolicyPage() {
  return <LegalDoc meta={LEGAL_DOCS.privacy} sections={SECTIONS} also={["terms", "cookies"]} />;
}
