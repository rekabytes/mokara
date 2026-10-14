# SEO and social previews

Public page metadata, canonical links, Open Graph cards, X/Twitter large-image
cards and the sitemap share `packages/frontend/lib/seo.server.ts`. The public
page registry includes the homepage, pricing, documentation, MCP guide and legal
pages. Authenticated pages, login/signup and MCP consent are not indexable.

## Runtime deployment settings

Set the frontend's existing `NEXT_PUBLIC_SITE_URL` to its actual public origin.
Use the origin only, without a path, query, credentials or fragment. This value
is read server-side at request time; the published image does not pin the URL
at build time. It is separate from `BACKEND_URL`, which is the server's internal
upstream address. MCP endpoint discovery continues to use the backend's
`AUTH_PUBLIC_URL` without changes.

`SEO_INDEXABLE=false` is the default. Keep it on development and staging. These
deployments publish `noindex, nofollow`, disallow crawling and serve an empty
sitemap. They still publish configured social-card URLs, so links can have a
preview when the receiving service is able to fetch them.

For the public production site, set `SEO_INDEXABLE=true` and configure
`NEXT_PUBLIC_SITE_URL`. This allows indexing of public pages and populates
`/sitemap.xml`; private and authentication routes remain excluded. Missing or
invalid public-origin configuration does not publish canonical/image URLs or
an indexable sitemap. No domain is guessed from request headers.

## Assets

- `/mokara-mark.svg`: indigo Interlock mark for public navigation and footer branding.
- `/icons/mokara-icon.svg`: white Interlock mark on indigo for browser tabs.
- `/favicon.ico`: 16, 32 and 48 pixel browser icons.
- `/icons/icon-32.png`: PNG browser fallback.
- `/icons/apple-touch-icon.png`: 180 pixel Apple home-screen icon.
- `/social/mokara-preview.jpg`: 1200 × 630 branded link card, using the existing
  sanitized product screenshot and the public site's Fraunces/Instrument Sans.

The social card is an explicit public marketing asset. It is never generated
from a user's tasks or authenticated workspace. Public routes provide their own
titles and descriptions with the shared image. The homepage includes WebSite
structured data without fabricated reviews, pricing or organization details.

## Verification after deployment

Open a public page's source and check its canonical URL, Open Graph URL/image,
Twitter card and robots meta tag. Open the configured origin's `/robots.txt`,
`/sitemap.xml`, icons and social image. Confirm development remains non-indexable
before enabling production. Share a public page in the intended messaging app;
preview caching and whether an embed appears are controlled by that service.
An already cached card may need that service's inspection/refresh tool.

Once production indexing is enabled, the owner can verify the domain in Google
Search Console and submit the sitemap. Development does not need submission.
No Cloudflare setting is required by these code changes; an existing bot or
access restriction can still prevent a third-party preview fetch.

References: [Next.js metadata](https://nextjs.org/docs/app/getting-started/metadata-and-og-images),
[robots](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots),
[sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap).
