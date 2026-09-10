import type { Metadata } from "next";
import { LegalDoc } from "@/components/LegalDoc";
import { LEGAL_DOCS } from "@/lib/legal";

import { SECTIONS } from "./sections";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: LEGAL_DOCS.cookies.description,
};

// The whole policy is verifiable from the code: packages/backend/src/lib/cookies.ts
// sets one cookie with these exact attributes, and the frontend contains no
// localStorage, sessionStorage, IndexedDB, service worker or third-party script.

export default function CookiePolicyPage() {
  return <LegalDoc meta={LEGAL_DOCS.cookies} sections={SECTIONS} also={["privacy", "terms"]} />;
}
