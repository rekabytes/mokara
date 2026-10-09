import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { OPERATOR } from "@/lib/legal";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#faq", label: "FAQs" },
  { href: "/pricing", label: "Pricing" },
];

/** Public navigation; the caller resolves the session, not the browser. */
export function SiteHeader({ authHref, authLabel }: { authHref: string; authLabel: string }) {
  const startHref = authHref === "/tasks" ? "/tasks" : "/signup";
  const startLabel = authHref === "/tasks" ? "Open workspace" : "Start free";

  return (
    <header className="public-header">
      <div className="public-container public-header-inner">
        <Link href="/" className="public-brand" aria-label={`${OPERATOR.productName} home`}>
          <BrandMark />
          <span>{OPERATOR.productName.toLowerCase()}</span>
        </Link>
        <nav className="public-desktop-nav" aria-label="Main navigation">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="public-header-actions">
          <Link href={authHref} className="public-login">
            {authLabel}
          </Link>
          <Link
            href={startHref}
            className="public-button public-button-primary public-button-small"
          >
            {startLabel}
          </Link>
          <details className="public-mobile-menu">
            <summary aria-label="Toggle navigation">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden
              >
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
            </summary>
            <nav aria-label="Mobile navigation">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
              <Link href={authHref}>{authLabel}</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
