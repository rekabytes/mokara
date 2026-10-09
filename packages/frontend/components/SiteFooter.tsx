import Link from "next/link";
import { cookies } from "next/headers";
import { BrandMark } from "@/components/BrandMark";
import { CONTACT, LEGAL_DOCS, LEGAL_LINKS, OPERATOR, siteHost } from "@/lib/legal";
import { AUTH_COOKIE } from "@/lib/cookies";

const PRODUCT_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#faq", label: "FAQs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Create account" },
];

/** Public pages retain every legal and configured operator contact link. */
export async function SiteFooter() {
  const hasSession = (await cookies()).has(AUTH_COOKIE);

  return (
    <footer className="public-footer">
      <div className="public-container public-footer-grid">
        <div>
          <Link href="/" className="public-brand" aria-label={`${OPERATOR.productName} home`}>
            <BrandMark />
            <span>{OPERATOR.productName.toLowerCase()}</span>
          </Link>
          <p className="public-footer-description">
            A clearer way for small teams to keep tasks, projects, and progress in view.
          </p>
          {OPERATOR.country && <p className="public-footer-note">Made in {OPERATOR.country}</p>}
          {CONTACT.email && (
            <a
              href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(OPERATOR.productName)}`}
              className="public-footer-contact"
            >
              {CONTACT.email}
            </a>
          )}
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <ul>
            <li>
              <Link href={hasSession ? "/tasks" : "/"}>{hasSession ? "Open app" : "Overview"}</Link>
            </li>
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <ul>
            {LEGAL_LINKS.map((doc) => (
              <li key={doc.href}>
                <Link href={doc.href}>{doc.nav}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="public-footer-bottom public-container">
        <span>
          © 2026 {OPERATOR.name ?? OPERATOR.productName}
          {siteHost() ? ` · ${siteHost()}` : ""}. All rights reserved.
        </span>
        <span className="public-footer-policies">
          <span>No third-party trackers</span>
          <span aria-hidden>·</span>
          <Link href={LEGAL_DOCS.cookies.href}>One session cookie</Link>
        </span>
      </div>
    </footer>
  );
}
