import type { Metadata, MetadataRoute } from "next";
import { LEGAL_DOCS } from "./legal-links";
import { siteOrigin } from "./legal.server";

export const SITE_DESCRIPTION =
  "A shared workspace for your team and your AI agent. Organize tasks, keep conversations in context and turn requests into progress with Mokara MCP.";
export const SOCIAL_IMAGE = {
  path: "/social/mokara-preview.jpg",
  width: 1200,
  height: 630,
  alt: "Mokara — Good work. Less busywork. A preview of the task workspace.",
};

// Keep the sitemap and each page's canonical/share metadata on the same registry.
export const PUBLIC_PAGES = {
  "/": { title: "Mokara — good work, less busywork", description: SITE_DESCRIPTION },
  "/pricing": {
    title: "Pricing · Mokara",
    description:
      "Compare Mokara plans for personal work and growing teams. Organize tasks, collaborate with your team and connect your AI agent.",
  },
  "/docs": {
    title: "Documentation · Mokara",
    description:
      "Practical guides for connecting your AI agent to Mokara and keeping control of your workspace.",
  },
  "/docs/mcp": {
    title: "Connect an AI agent with MCP · Mokara",
    description:
      "Connect your AI agent to Mokara with secure sign-in, selected workspace permissions and revocable access to tasks and GitHub repositories.",
  },
  "/privacy-policy": {
    title: "Privacy Policy · Mokara",
    description: LEGAL_DOCS.privacy.description,
  },
  "/terms-of-use": { title: "Terms of Use · Mokara", description: LEGAL_DOCS.terms.description },
  "/cookie-policy": {
    title: "Cookie Policy · Mokara",
    description: LEGAL_DOCS.cookies.description,
  },
} satisfies Record<string, { title: string; description: string }>;

/** Server-only runtime read. Never infer a domain from request headers or a fallback. */
export function getSeoOrigin(): URL | null {
  const configured = siteOrigin();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function isSearchIndexable(): boolean {
  return process.env.SEO_INDEXABLE === "true" && getSeoOrigin() !== null;
}

export const PRIVATE_ROBOTS = { index: false, follow: false } satisfies Metadata["robots"];

export function getRootMetadata(): Metadata {
  const origin = getSeoOrigin();
  return {
    ...(origin ? { metadataBase: origin } : {}),
    title: { default: "Mokara", template: "%s · Mokara" },
    description: SITE_DESCRIPTION,
    applicationName: "Mokara",
    robots: isSearchIndexable() ? { index: true, follow: true } : PRIVATE_ROBOTS,
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
        { url: "/icons/mokara-icon.svg", type: "image/svg+xml", sizes: "any" },
        { url: "/icons/icon-32.png", type: "image/png", sizes: "32x32" },
      ],
      apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    },
    ...getSocialMetadata("Mokara", SITE_DESCRIPTION),
  };
}

function getSocialMetadata(title: string, description: string, path?: string): Metadata {
  const origin = getSeoOrigin();
  const image = origin ? new URL(SOCIAL_IMAGE.path, origin).href : null;
  return {
    openGraph: {
      type: "website",
      siteName: "Mokara",
      locale: "en_US",
      title,
      description,
      ...(origin && path ? { url: new URL(path, origin).href } : {}),
      ...(image
        ? {
            images: [
              {
                url: image,
                width: SOCIAL_IMAGE.width,
                height: SOCIAL_IMAGE.height,
                alt: SOCIAL_IMAGE.alt,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [{ url: image, alt: SOCIAL_IMAGE.alt }] } : {}),
    },
  };
}

export function getPublicMetadata(path: keyof typeof PUBLIC_PAGES): Metadata {
  const page = PUBLIC_PAGES[path];
  const origin = getSeoOrigin();
  return {
    title: { absolute: page.title },
    description: page.description,
    ...(origin ? { alternates: { canonical: new URL(path, origin).href } } : {}),
    ...getSocialMetadata(page.title, page.description, path),
  };
}

export function getSitemap(): MetadataRoute.Sitemap {
  const origin = getSeoOrigin();
  if (!origin || !isSearchIndexable()) return [];
  return Object.keys(PUBLIC_PAGES).map((path) => ({ url: new URL(path, origin).href }));
}

export function getRobots(): MetadataRoute.Robots {
  const origin = getSeoOrigin();
  if (!origin || !isSearchIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/files",
        "/tasks",
        "/analytics",
        "/teams",
        "/settings",
        "/dashboard",
        "/invitations",
        "/login",
        "/signup",
        "/mcp/authorize",
      ],
    },
    sitemap: new URL("/sitemap.xml", origin).href,
  };
}

export function getWebsiteStructuredData() {
  const origin = getSeoOrigin();
  if (!origin) return null;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Mokara",
    url: origin.href,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
  };
}
