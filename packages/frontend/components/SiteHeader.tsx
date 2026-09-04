import Link from "next/link";
import { OPERATOR } from "@/lib/legal";

/**
 * Public marketing header, shared by the landing page and the legal documents
 * so the two can't drift. The caller resolves the session cookie and passes the
 * CTA down, which keeps this a pure server component.
 */
export function SiteHeader({ authHref, authLabel }: { authHref: string; authLabel: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)] backdrop-blur-[22px]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="block size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_var(--color-accent-soft)]" />
          <span className="font-display text-[1.05rem] font-semibold tracking-[0.01em]">
            {OPERATOR.productName}
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href={authHref}
            className="rounded-[var(--radius-btn)] px-3.5 py-1.5 text-[0.9rem] font-semibold text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            {authLabel}
          </Link>
          <Link
            href="/signup"
            className="rounded-[var(--radius-btn)] bg-[var(--color-accent)] px-3.5 py-1.5 text-[0.9rem] font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
