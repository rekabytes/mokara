import Link from "next/link";
import type { ReactNode } from "react";
import {
  ADDRESS_NOT_PUBLISHED,
  CONTACT,
  GOVERNING_LAW,
  LEGAL_DOCS,
  LEGAL_EFFECTIVE,
  LEGAL_UPDATED,
  OPERATOR,
  siteOrigin,
  type LegalDocMeta,
  type LegalSlug,
} from "@/lib/legal";

/**
 * Chrome + content primitives for the public legal documents.
 *
 * A page supplies a flat, ordered array of sections; the "On this page" index
 * is generated from that same array, so the navigation can never drift away
 * from the body. Everything typographic here is deliberately quiet — these
 * pages are read, not admired.
 */

export type LegalSection = {
  /** Anchor id, also used by the index. */
  id: string;
  title: string;
  body: ReactNode;
};

export function LegalDoc({
  meta,
  sections,
  also,
}: {
  meta: LegalDocMeta;
  sections: LegalSection[];
  /** Sibling documents, linked under the body. */
  also?: LegalSlug[];
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-4 pt-12 sm:pt-16">
      <p className="m-0 font-label text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
        <span className="text-[var(--color-accent)]">Legal</span> · {OPERATOR.productName}
      </p>
      <h1 className="m-0 mt-3 font-display text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.015em] sm:text-[2.6rem]">
        {meta.title}
      </h1>
      <p className="m-0 mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-[var(--color-ink-muted)]">
        {meta.lede}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[var(--color-border-soft)] py-3 font-label text-[0.72rem] uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
        <span>
          Last updated{" "}
          <span className="text-[var(--color-ink-muted)] normal-case">{LEGAL_UPDATED}</span>
        </span>
        <span>
          Effective{" "}
          <span className="text-[var(--color-ink-muted)] normal-case">{LEGAL_EFFECTIVE}</span>
        </span>
        <span>
          Governing law{" "}
          <span className="text-[var(--color-ink-muted)] normal-case">{GOVERNING_LAW}</span>
        </span>
      </div>

      <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-[210px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="md:sticky md:top-20 md:self-start">
          <p className="m-0 mb-3 font-label text-[0.68rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
            On this page
          </p>
          <ol className="m-0 list-none space-y-px p-0">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-baseline gap-2 rounded-[8px] px-2 py-1.5 text-[0.83rem] leading-snug text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                >
                  <span className="font-label text-[0.7rem] text-[var(--color-accent)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 max-w-3xl">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 pb-10">
              <h2 className="m-0 mb-3 flex items-baseline gap-3 font-display text-[1.32rem] font-semibold leading-tight tracking-[-0.01em]">
                <span className="font-label text-[0.78rem] font-medium text-[var(--color-accent)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.title}
              </h2>
              <div className="legal-body">{s.body}</div>
            </section>
          ))}

          {also && also.length > 0 && (
            <div className="border-t border-[var(--color-border-soft)] pt-6">
              <p className="m-0 font-label text-[0.68rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
                Also relevant
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {also.map((slug) => (
                  <Link
                    key={slug}
                    href={LEGAL_DOCS[slug].href}
                    className="rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-3.5 py-1.5 text-[0.86rem] font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
                  >
                    {LEGAL_DOCS[slug].nav} →
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- primitives */

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mt-4 text-[0.95rem] leading-[1.75] text-[var(--color-ink-muted)]">
      {children}
    </p>
  );
}

export function L({ items, ordered = false }: { items: ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag
      className={`m-0 mt-4 space-y-1.5 pl-5 text-[0.95rem] leading-[1.7] text-[var(--color-ink-muted)] ${
        ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </Tag>
  );
}

export function Sub({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <h3 className="m-0 mt-8 flex items-baseline gap-2 text-[1rem] font-semibold tracking-[-0.005em] text-[var(--color-ink)]">
      {n && (
        <span className="font-label text-[0.75rem] font-medium text-[var(--color-ink-faint)]">
          {n}
        </span>
      )}
      {children}
    </h3>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-[var(--color-ink)]">{children}</strong>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[6px] bg-[var(--color-accent-soft)] px-[0.4em] py-[0.15em] font-label text-[0.85em] text-[var(--color-progress)]">
      {children}
    </code>
  );
}

export function Internal({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-semibold text-[var(--color-accent)] underline decoration-[var(--color-accent-soft)] decoration-2 underline-offset-2 transition-colors hover:decoration-[var(--color-accent)]"
    >
      {children}
    </Link>
  );
}

export function LegalTable({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="mt-5 min-w-0 overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[0.88rem] leading-relaxed">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                className="border-b border-[var(--color-border-strong)] pb-2 pr-4 font-label text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-faint)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="align-top">
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="border-b border-[var(--color-border-soft)] py-2.5 pr-4 text-[var(--color-ink-muted)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const accent =
    tone === "warn"
      ? "border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger-ink)]"
      : "border-[var(--color-border-soft)] bg-[var(--color-accent-soft)] text-[var(--color-ink)]";
  return (
    <div
      className={`mt-5 rounded-[var(--radius-card)] border px-5 py-4 text-[0.9rem] leading-relaxed ${accent}`}
    >
      {title && <p className="m-0 mb-1 font-semibold">{title}</p>}
      <div className="[&_p]:m-0 [&_p+p]:mt-2 [&_strong]:font-semibold">{children}</div>
    </div>
  );
}

/** A value the deployment has not provided. Highlighted on purpose. */
export function Pending({ varName, children }: { varName?: string; children: ReactNode }) {
  return (
    <span
      title={
        varName
          ? `Not configured — set ${varName} in the frontend environment (see .env.example)`
          : "Not configured — set the matching value in the frontend environment"
      }
      className="rounded-[6px] border border-dashed border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-[0.45em] py-[0.12em] font-label text-[0.82em] text-[var(--color-warning)]"
    >
      {children}
    </span>
  );
}

/**
 * Render an operator-supplied value inline, or the chip naming the variable.
 * Exported so the documents can use it inside prose.
 */
export const field = (value: string | null, varName: string, label?: string): ReactNode =>
  value ?? <Pending varName={varName}>{label ?? varName}</Pending>;

/** The operator's inbox as a mailto, straight from the environment. */
export function Mailto({ label }: { label?: string }) {
  if (!CONTACT.email) return <Pending varName="LEG_CONTACT_EMAIL">contact email</Pending>;
  return (
    <a
      href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(OPERATOR.productName)}`}
      className="font-semibold text-[var(--color-accent)] underline decoration-[var(--color-accent-soft)] decoration-2 underline-offset-2 transition-colors hover:decoration-[var(--color-accent)]"
    >
      {label ?? CONTACT.email}
    </a>
  );
}

/**
 * Operator identity block — the part a PDPA/GDPR notice has to state. Rows come
 * from lib/legal.ts; a row that is deliberately not published (the address)
 * renders as plain text, while an unknown value still renders as a chip.
 */
export function ContactBlock() {
  const origin = siteOrigin();
  const rows: [string, ReactNode][] = [
    [
      "Service",
      origin ? (
        <a
          href={origin}
          className="font-semibold text-[var(--color-accent)] underline decoration-[var(--color-accent-soft)] decoration-2 underline-offset-2 transition-colors hover:decoration-[var(--color-accent)]"
        >
          {origin.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        <Pending varName="NEXT_PUBLIC_SITE_URL">NEXT_PUBLIC_SITE_URL</Pending>
      ),
    ],
    [
      "Data controller",
      OPERATOR.name ?? <Pending varName="LEG_OPERATOR_NAME">operator name</Pending>,
    ],
    [
      "Registration",
      OPERATOR.registrationNo ?? (
        <Pending varName="LEG_OPERATOR_REGISTRATION">registration no.</Pending>
      ),
    ],
    ["Requests inbox", <Mailto key="inbox" />],
    ["Correspondence address", CONTACT.postalAddress ?? ADDRESS_NOT_PUBLISHED],
    [
      "Data protection officer",
      CONTACT.email === null ? (
        <Pending key="dpo" varName="LEG_CONTACT_EMAIL">
          DPO contact
        </Pending>
      ) : (
        <span key="dpo">
          No separate officer — requests reach the operator via <Mailto />
        </span>
      ),
    ],
  ];
  if (OPERATOR.entityNote) rows.splice(3, 0, ["Legal status", OPERATOR.entityNote]);
  return (
    <div className="mt-5 grid gap-x-8 gap-y-0 border-t border-[var(--color-border-soft)] sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="flex flex-wrap items-baseline gap-x-3 border-b border-[var(--color-border-soft)] py-2.5"
        >
          <span className="font-label text-[0.68rem] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
            {k}
          </span>
          <span className="text-[0.9rem] text-[var(--color-ink-muted)]">{v}</span>
        </div>
      ))}
    </div>
  );
}
