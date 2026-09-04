// Operator identity for the public legal documents — read from the environment.
//
// This module is the single source of truth for routes, titles and dates, but it
// deliberately holds **no operator data**: who runs the Service, their
// registration number and their contact address are deployment facts, not
// repository facts. Mokara is self-hostable, so anyone can publish their own
// version of these pages by exporting the variables below.
//
// The boundary: env vars say *who you are*; the page text says *what you
// promise* (statutes, liability cap, governing law) and is edited in the .tsx.
//
// Anything unset renders as a highlighted "not configured" chip rather than a
// blank, so an incomplete installation can never quietly ship someone else's
// policy — or look finished when it isn't.
//
//   LEG_OPERATOR_NAME           legal name of the data controller
//   LEG_OPERATOR_REGISTRATION   business/company registration number
//   LEG_OPERATOR_ENTITY_NOTE    optional one-liner on the legal form
//   LEG_CONTACT_EMAIL           data requests, support, abuse, security
//   LEG_POSTAL_ADDRESS          correspondence address (optional)
//   LEG_HOSTING_REGION          where the hosted database runs
//   LEG_BACKUP_RETENTION        how long backups are kept
//   NEXT_PUBLIC_SITE_URL                public origin, no trailing slash

const env = (key: string): string | null => process.env[key]?.trim() || null;

/** Date the documents were last revised, and when that revision takes effect. */
export const LEGAL_UPDATED = "4 September 2026";
export const LEGAL_EFFECTIVE = "4 September 2026";

/** The law these documents are drafted under — a property of the text. */
export const GOVERNING_LAW = "Malaysia";

export const OPERATOR = {
  /** Trading or registered name of the entity operating the hosted Service. */
  name: env("LEG_OPERATOR_NAME"),
  /** SSM / Companies Commission reference, quoted in the notice. */
  registrationNo: env("LEG_OPERATOR_REGISTRATION"),
  /** e.g. "a business registered in Malaysia under the Registration of
   * Businesses Act 1956, which is not a separate legal person". */
  entityNote: env("LEG_OPERATOR_ENTITY_NOTE"),
  /** Where the operator is based — used in the footer only, omitted when unset. */
  country: env("LEG_OPERATOR_COUNTRY"),
  /** Product name: part of the software, so it has a default. */
  productName: env("LEG_PRODUCT_NAME") ?? "Mokara",
};

export const CONTACT = {
  /** One inbox for data-subject requests, support, abuse and security reports. */
  email: env("LEG_CONTACT_EMAIL"),
  /** null is a valid choice, rendered as a stated withholding, not a gap. */
  postalAddress: env("LEG_POSTAL_ADDRESS"),
  /** Region the hosted database runs in — needed for the s.12 transfer note. */
  hostingRegion: env("LEG_HOSTING_REGION"),
  /** Caps how fast deletion is final, and how long logs survive. */
  backupRetention: env("LEG_BACKUP_RETENTION"),
};

/**
 * There is no published office address unless one is configured, and a home
 * address should not go on a website. This is what we say instead — enough for
 * the PDPA's notice duty (contact *details*, not a street address) and for
 * GDPR's “identity and contact details”.
 */
export const ADDRESS_NOT_PUBLISHED =
  "not published — an address for service is supplied on request to a data subject, " +
  "the Personal Data Protection Commissioner, or a court";

/** Public origin of the Service, or null when it has not been configured. */
export const siteOrigin = (): string | null => env("NEXT_PUBLIC_SITE_URL");

/** The origin without a scheme, for inline prose; null when unset. */
export const siteHost = (): string | null => siteOrigin()?.replace(/^https?:\/\//, "") ?? null;

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
