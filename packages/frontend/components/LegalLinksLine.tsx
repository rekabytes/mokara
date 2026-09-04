import Link from "next/link";
import { Fragment } from "react";
import { LEGAL_LINKS } from "@/lib/legal";

/**
 * The one-line legal link strip used under the auth forms. Kept in one place so
 * the sign-up and login pages cannot disagree about which documents exist.
 */
export function LegalLinksLine({ lead }: { lead?: string }) {
  return (
    <p className="m-0 mt-5 text-center text-[0.76rem] leading-relaxed text-[var(--color-ink-faint)]">
      {lead ? <span>{lead} </span> : null}
      {LEGAL_LINKS.map((doc, i) => (
        <Fragment key={doc.href}>
          {i > 0 && <span aria-hidden> · </span>}
          <Link
            href={doc.href}
            className="underline decoration-[var(--color-border-strong)] decoration-1 underline-offset-2 transition-colors hover:text-[var(--color-ink-muted)] hover:decoration-[var(--color-accent)]"
          >
            {doc.nav}
          </Link>
        </Fragment>
      ))}
    </p>
  );
}
