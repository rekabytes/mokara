import Link from "next/link";
import { cookies } from "next/headers";
import { CONTACT, LEGAL_DOCS, LEGAL_LINKS, OPERATOR, siteHost } from "@/lib/legal";
import { AUTH_COOKIE } from "@/lib/cookies";

const PRODUCT_LINKS = [
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Create account" },
];

/**
 * Site-wide footer for the public pages. Structured as three columns — brand,
 * product, legal — over a hairline bottom bar, so every policy is one click
 * from any public page. Reads the session cookie only to relabel the app link.
 */
export async function SiteFooter() {
  const hasSession = (await cookies()).has(AUTH_COOKIE);

  return (
    <footer className="border-t border-[var(--color-border-soft)]">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-y-8 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-x-10">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <span className="block size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              <span className="font-display text-[1.05rem] font-semibold tracking-[0.01em]">
                {OPERATOR.productName}
              </span>
            </Link>
            <p className="m-0 mt-3 max-w-xs text-[0.88rem] leading-relaxed text-[var(--color-ink-muted)]">
              Tasks, projects and weighted KPIs in one quiet board.
            </p>
            {OPERATOR.country && (
              <p className="m-0 mt-3 font-label text-[0.68rem] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                Made in {OPERATOR.country}
              </p>
            )}
            {CONTACT.email && (
              <a
                href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(OPERATOR.productName)}`}
                className="mt-3 inline-block text-[0.88rem] text-[var(--color-ink-muted)] underline decoration-[var(--color-border-soft)] decoration-1 underline-offset-2 transition-colors hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
              >
                {CONTACT.email}
              </a>
            )}
          </div>

          <nav aria-label="Product">
            <p className="m-0 font-label text-[0.68rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
              Product
            </p>
            <ul className="m-0 mt-3 list-none space-y-2 p-0 text-[0.88rem]">
              <li>
                <Link
                  href={hasSession ? "/tasks" : "/"}
                  className="text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  {hasSession ? "Open app" : "Overview"}
                </Link>
              </li>
              {PRODUCT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <p className="m-0 font-label text-[0.68rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
              Legal
            </p>
            <ul className="m-0 mt-3 list-none space-y-2 p-0 text-[0.88rem]">
              {LEGAL_LINKS.map((doc) => (
                <li key={doc.href}>
                  <Link
                    href={doc.href}
                    className="text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                  >
                    {doc.nav}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-5 text-[0.8rem] text-[var(--color-ink-faint)]">
          <span>
            © 2026 {OPERATOR.name ?? OPERATOR.productName}
            {siteHost() ? ` · ${siteHost()}` : ""}. All rights reserved.
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-label text-[0.7rem] uppercase tracking-[0.12em]">
            <span>No third-party trackers</span>
            <span aria-hidden>·</span>
            <Link
              href={LEGAL_DOCS.cookies.href}
              className="transition-colors hover:text-[var(--color-ink-muted)]"
            >
              One session cookie
            </Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
