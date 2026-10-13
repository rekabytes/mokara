// Public document metadata shared by server pages and client auth links.
// Deployment/operator environment values remain in legal.server.ts.

export type LegalSlug = "terms" | "privacy" | "cookies";

export type LegalDocMeta = {
  slug: LegalSlug;
  href: string;
  /** Short label used in the footer and cross-links. */
  nav: string;
  title: string;
  /** One line under the H1. */
  lede: string;
  description: string;
};

export const LEGAL_DOCS: Record<LegalSlug, LegalDocMeta> = {
  terms: {
    slug: "terms",
    href: "/terms-of-use",
    nav: "Terms of Use",
    title: "Terms of Use",
    lede: "The agreement between you and the operator of Mokara.",
    description:
      "Terms of Use for Mokara: accounts, acceptable use, your content, team workspaces, self-hosting, liability and Malaysian governing law.",
  },
  privacy: {
    slug: "privacy",
    href: "/privacy-policy",
    nav: "Privacy Policy",
    title: "Privacy Policy",
    lede: "What Mokara records about you, why, for how long, and how you get it back or removed.",
    description:
      "How Mokara handles personal data under the Malaysian Personal Data Protection Act 2010 (as amended), GDPR, UK GDPR and other frameworks.",
  },
  cookies: {
    slug: "cookies",
    href: "/cookie-policy",
    nav: "Cookie Policy",
    title: "Cookie Policy",
    lede: "One cookie. It keeps you signed in. Nothing else is stored on your device.",
    description:
      "Mokara sets a single strictly-necessary session cookie, uses no third-party cookies, analytics or advertising trackers, and needs no consent banner.",
  },
};

/** Order the documents are listed in the footer and the consent lines. */
export const LEGAL_LINKS: LegalDocMeta[] = [
  LEGAL_DOCS.privacy,
  LEGAL_DOCS.terms,
  LEGAL_DOCS.cookies,
];
