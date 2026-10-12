import type { ReactNode } from "react";
import Link from "next/link";
import { DOCUMENTATION_LINKS } from "@/lib/documentation-links";

export function DocPage({
  current,
  title,
  description,
  children,
}: {
  current: (typeof DOCUMENTATION_LINKS)[number]["href"];
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main id="main" className="docs-page public-container">
      <nav className="docs-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Mokara</Link>
        <span aria-hidden="true">/</span>
        {current === "/docs" ? (
          <span aria-current="page">Documentation</span>
        ) : (
          <>
            <Link href="/docs">Documentation</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">
              {current.endsWith("configuration") ? "Configuration" : "AI agents"}
            </span>
          </>
        )}
      </nav>
      <div className="docs-layout">
        <aside className="docs-sidebar">
          <p className="docs-label">Guides &amp; reference</p>
          <nav aria-label="Documentation">
            {DOCUMENTATION_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.href === current ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="docs-sidebar-note">
            <span className="docs-label">MCP access</span>
            <p>Read-only. Selected workspaces. Always yours to revoke.</p>
          </div>
        </aside>
        <article className="docs-article">
          <header className="docs-heading">
            <p className="docs-label">Mokara documentation</p>
            <h1>{title}</h1>
            <p className="docs-intro">{description}</p>
          </header>
          <div className="docs-content">{children}</div>
        </article>
      </div>
    </main>
  );
}
