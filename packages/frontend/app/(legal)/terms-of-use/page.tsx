import { getPublicMetadata } from "@/lib/seo.server";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { LEGAL_DOCS } from "@/lib/legal-links";

import { SECTIONS } from "./sections";

export function generateMetadata(): Metadata {
  return getPublicMetadata("/terms-of-use");
}

// Malaysian-framed terms: Contracts Act 1950 for formation, PDPA for the data
// half (which lives in the privacy policy), Computer Crimes Act 1997 and
// s. 233 CMA 1998 for the abuse clauses, and Malaysian courts for disputes —
// with the mandatory-rights carve-outs that make the same text usable abroad.

export default function TermsOfUsePage() {
  return <LegalDoc meta={LEGAL_DOCS.terms} sections={SECTIONS} also={["privacy", "cookies"]} />;
}
