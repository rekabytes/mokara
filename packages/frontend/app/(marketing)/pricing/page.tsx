import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Reveal } from "@/components/Reveal";
import { AUTH_COOKIE } from "@/lib/cookies";
import { FAQ, IN_EVERY_PLAN, LATER_TIERS, TIERS, type Tier } from "@/lib/pricing";

// The pricing page, in the landing page's voice: Fraunces display with an
// italic accent, IBM Plex Mono eyebrows, hairline section breaks, one-shot
// scroll reveals over the ambient field. Content is the owner-approved ladder
// (PRD-11 §2/§4/§5) — see lib/pricing.ts for where each number comes from.
// The whole page argues one thing: money buys room, never a feature.

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free for a trio, four dollars a month for a team. Mokara sells capacity, never features — and self-hosting stays free forever.",
  openGraph: {
    title: "Mokara — pricing",
    description:
      "Pay for capacity, never for features. Free for three people, $4 a month for a team.",
  },
};

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 12.5l4.5 4.5L19.5 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Kicker({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="m-0 font-label text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
      <span className="text-[var(--color-accent)]">{index}</span> {children}
    </p>
  );
}

export default async function PricingPage() {
  // Signed-in visitors are not "leads": their CTA goes to the app and to the
  // billing card that already exists, not back to signup.
  const hasSession = (await cookies()).has(AUTH_COOKIE);

  return (
    <main>
      {/* ---- hero ---- */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-2 text-center sm:pt-24">
        <Reveal>
          <p className="m-0 font-label text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
            <span className="text-[var(--color-accent)]">Pricing</span> · flat per workspace
          </p>
          <h1 className="m-0 mt-4 font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[3.4rem]">
            Pay for capacity.{" "}
            <em className="italic text-[var(--color-accent)]">Never for features.</em>
          </h1>
          <p className="mx-auto mt-5 mb-0 max-w-xl text-[1.02rem] leading-relaxed text-[var(--color-ink-muted)]">
            Everything Mokara does today is on every plan, including the free one. What you buy is
            room — more members, more workspaces, more storage — and, on the hosted instance,
            someone else running it for you.
          </p>
          <p className="mx-auto mt-6 mb-0 font-label text-[0.72rem] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
            usd · cards &amp; link · cancel anytime
          </p>
        </Reveal>
      </section>

      {/* ---- the two plans you can actually have ---- */}
      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <div className="grid items-stretch gap-5 md:grid-cols-2">
          {TIERS.map((tier) => (
            <Reveal key={tier.id} className="min-w-0">
              <PlanCard
                tier={tier}
                ctaHref={hasSession ? (tier.featured ? "/settings" : "/tasks") : "/signup"}
                ctaLabel={
                  hasSession
                    ? tier.featured
                      ? "Upgrade in Settings"
                      : "Open app"
                    : tier.featured
                      ? "Start free, then upgrade"
                      : "Create free account"
                }
              />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- what every plan already contains ---- */}
      <section className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <Reveal>
            <Kicker index="01">· Nothing behind the glass</Kicker>
            <h2 className="m-0 mt-3 font-display text-[2rem] font-semibold tracking-[-0.01em] sm:text-[2.4rem]">
              Nothing is ever moved behind a paywall.
            </h2>
            <p className="mb-0 mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-[var(--color-ink-muted)]">
              Once a feature ships, it belongs to every plan. Tiers differ in capacity and in two
              Starter-only extras — never in whether you can do the work.
            </p>
            <div className="mt-8 grid gap-x-12 sm:grid-cols-2">
              {IN_EVERY_PLAN.map(([n, text]) => (
                <div
                  key={n}
                  className="flex items-baseline gap-4 border-t border-[var(--color-border-soft)] py-3"
                >
                  <span className="font-label text-[0.72rem] font-medium text-[var(--color-accent)]">
                    {n}
                  </span>
                  <span className="text-[0.92rem] leading-relaxed text-[var(--color-ink-muted)]">
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- the open-core door ---- */}
      <section className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <Reveal>
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-8 shadow-[var(--shadow-card)] sm:p-10">
              <Kicker index="02">· Or take the whole thing home</Kicker>
              <h2 className="m-0 mt-3 font-display text-[2rem] font-semibold tracking-[-0.01em] sm:text-[2.4rem]">
                Self-hosted is free, forever,{" "}
                <em className="italic text-[var(--color-accent)]">all of it</em>.
              </h2>
              <p className="mb-0 mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-[var(--color-ink-muted)]">
                The same images we run for you are published on every release tag. Point them at
                your own Postgres, Redis and S3-compatible bucket and every cap is off. No licence
                key, no phone-home, no feature that only exists on our server.
              </p>
              <p className="m-0 mt-6 font-label text-[0.72rem] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                docker images · your hardware · your rules
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- the rest of the ladder, honestly labelled ---- */}
      <section className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <Reveal>
            <Kicker index="03">· Further up the road</Kicker>
            <h2 className="m-0 mt-3 font-display text-[2rem] font-semibold tracking-[-0.01em] sm:text-[2.4rem]">
              Pro and Ultra are planned, not open.
            </h2>
            <p className="mb-0 mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-[var(--color-ink-muted)]">
              They exist in the plan, not in the checkout. Published here so that when they arrive,
              nobody has to guess what they cost or what they are for.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {LATER_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className="min-w-0 rounded-[var(--radius-card)] border border-[var(--color-border-soft)] p-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="m-0 font-display text-[1.25rem] font-semibold tracking-[-0.01em]">
                      {tier.name}
                    </h3>
                    <span className="font-label text-[0.8rem] text-[var(--color-ink-muted)]">
                      {tier.price}
                    </span>
                  </div>
                  <p className="mb-0 mt-1 text-[0.9rem] text-[var(--color-ink-muted)]">
                    {tier.summary}
                  </p>
                  <ul className="m-0 mt-4 flex list-none flex-wrap gap-2 p-0">
                    {tier.cells.map((cell) => (
                      <li
                        key={cell}
                        className="rounded-[var(--radius-pill)] bg-[var(--color-pill-bg)] px-2.5 py-1 font-label text-[0.68rem] text-[var(--color-ink-muted)]"
                      >
                        {cell}
                      </li>
                    ))}
                  </ul>
                  <p className="m-0 mt-5 font-label text-[0.66rem] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                    Not open for signup yet
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- straight answers ---- */}
      <section className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <Reveal>
            <Kicker index="04">· Straight answers</Kicker>
            <h2 className="m-0 mt-3 font-display text-[2rem] font-semibold tracking-[-0.01em] sm:text-[2.4rem]">
              The awkward questions, first.
            </h2>
            <dl className="m-0 mt-8 grid gap-x-12 sm:grid-cols-2">
              {FAQ.map((item) => (
                <div key={item.q} className="border-t border-[var(--color-border-soft)] py-5">
                  <dt className="text-[0.98rem] font-semibold">{item.q}</dt>
                  <dd className="m-0 mt-2 text-[0.92rem] leading-relaxed text-[var(--color-ink-muted)]">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ---- closer ---- */}
      <section className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-24">
          <Reveal>
            <h2 className="m-0 font-display text-[2.2rem] font-semibold tracking-[-0.01em] sm:text-[2.8rem]">
              Three is enough.{" "}
              <em className="italic text-[var(--color-accent)]">Until it isn’t.</em>
            </h2>
            <p className="mx-auto mt-4 mb-0 max-w-md text-[0.98rem] leading-relaxed text-[var(--color-ink-muted)]">
              Start on Free — no card, no trial clock. When the team outgrows it, the upgrade is one
              click away in Settings.
            </p>
            <Link
              href={hasSession ? "/settings" : "/signup"}
              className="mt-8 inline-block rounded-[var(--radius-btn)] bg-[var(--color-accent)] px-6 py-3 text-[0.95rem] font-semibold text-white shadow-[var(--shadow-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              {hasSession ? "Open Plan & billing" : "Get started"}
            </Link>
            <p className="mb-0 mt-6 font-label text-[0.72rem] tracking-[0.06em] text-[var(--color-ink-faint)]">
              free · self-hostable · your data, your server
            </p>
          </Reveal>
        </div>
      </section>
    </main>
  );
}

function PlanCard({ tier, ctaHref, ctaLabel }: { tier: Tier; ctaHref: string; ctaLabel: string }) {
  return (
    <div
      className={`relative flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border bg-[var(--color-surface-solid)] p-7 sm:p-8 ${
        tier.featured
          ? "border-[var(--color-accent)]/30 shadow-[var(--shadow-lift)]"
          : "border-[var(--color-border-soft)] shadow-[var(--shadow-card)]"
      }`}
    >
      {tier.featured && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,transparent,var(--color-accent),transparent)]"
        />
      )}

      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-[1.5rem] font-semibold tracking-[-0.01em]">
          {tier.name}
        </h2>
        {tier.featured && (
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-accent-soft)] px-2.5 py-1 font-label text-[0.62rem] font-medium uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Recommended
          </span>
        )}
      </div>

      {/* min-height = two lines of this type: the taglines differ in length, and
          without it the capacity rows below stop lining up across the cards. */}
      <p className="mb-0 mt-2 min-h-[3rem] text-[0.92rem] leading-relaxed text-[var(--color-ink-muted)]">
        {tier.tagline}
      </p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="font-display text-[3rem] font-semibold leading-none tracking-[-0.02em]">
          {tier.price}
        </span>
        {tier.cadence && (
          <span className="text-[0.95rem] text-[var(--color-ink-muted)]">{tier.cadence}</span>
        )}
      </div>

      <dl className="m-0 mt-6">
        {tier.capacity.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-t border-[var(--color-border-soft)] py-2.5"
          >
            <dt className="font-label text-[0.68rem] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
              {row.label}
            </dt>
            <dd className="m-0 text-[0.92rem] font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="m-0 mt-6 font-label text-[0.68rem] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
        {tier.addsLabel}
      </p>
      <ul className="m-0 mt-3 list-none space-y-2 p-0">
        {tier.adds.map((item) => (
          <li
            key={item}
            className="flex items-start gap-2.5 text-[0.92rem] leading-snug text-[var(--color-ink-muted)]"
          >
            <span
              className={`mt-[3px] flex-none ${
                tier.featured ? "text-[var(--color-accent)]" : "text-[var(--color-ink-faint)]"
              }`}
            >
              <Tick />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <Link
          href={ctaHref}
          className={`block rounded-[var(--radius-btn)] px-6 py-3 text-center text-[0.95rem] font-semibold transition-colors ${
            tier.featured
              ? "bg-[var(--color-accent)] text-white shadow-[var(--shadow-accent)] hover:bg-[var(--color-accent-hover)]"
              : "border border-[var(--color-border-strong)] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]"
          }`}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
