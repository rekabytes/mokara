import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/cookies";
import { FAQ, IN_EVERY_PLAN, LATER_TIERS, TIERS, type Tier } from "@/lib/pricing";

import "./pricing.css";

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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <p className="pricing-eyebrow">
      <span>{index}</span> {children}
    </p>
  );
}

export default async function PricingPage() {
  const hasSession = (await cookies()).has(AUTH_COOKIE);

  return (
    <main className="pricing-page" id="main">
      <section className="pricing-hero public-container" aria-labelledby="pricing-title">
        <div>
          <p className="pricing-eyebrow">Pricing · flat per workspace</p>
          <h1 id="pricing-title">
            Pay for capacity.
            <br />
            <em>Never for features.</em>
          </h1>
        </div>
        <div className="pricing-hero-copy">
          <p>
            Everything Mokara does today is on every plan, including the free one. What you buy is
            room — more members, more workspaces, more storage — and, on the hosted instance,
            someone else running it for you.
          </p>
          <p className="pricing-payment-note">USD · cards &amp; Link · cancel anytime</p>
        </div>
      </section>

      <section className="pricing-plans public-container" aria-label="Available hosted plans">
        {TIERS.map((tier) => (
          <PlanCard
            key={tier.id}
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
        ))}
      </section>

      <section className="pricing-section public-container" aria-labelledby="included-title">
        <div className="pricing-section-copy">
          <Kicker index="01">· Nothing behind the glass</Kicker>
          <h2 id="included-title">Nothing is ever moved behind a paywall.</h2>
          <p>
            Once a feature ships, it belongs to every plan. Tiers differ in capacity and in two
            Starter-only extras — never in whether you can do the work.
          </p>
        </div>
        <div className="pricing-included">
          {IN_EVERY_PLAN.map(([n, text]) => (
            <div key={n}>
              <span className="pricing-feature-number">{n}</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pricing-selfhost" aria-labelledby="selfhost-title">
        <div className="public-container pricing-section-layout">
          <div className="pricing-section-copy">
            <Kicker index="02">· Or take the whole thing home</Kicker>
            <h2 id="selfhost-title">
              Self-hosted is free, forever, <em>all of it</em>.
            </h2>
          </div>
          <div className="pricing-selfhost-copy">
            <p>
              The same images we run for you are published on every release tag. Point them at your
              own Postgres, Redis and S3-compatible bucket and every cap is off. No licence key, no
              phone-home, no feature that only exists on our server.
            </p>
            <p className="pricing-payment-note">Docker images · your hardware · your rules</p>
          </div>
        </div>
      </section>

      <section className="pricing-section public-container" aria-labelledby="planned-title">
        <div className="pricing-section-copy">
          <Kicker index="03">· Further up the road</Kicker>
          <h2 id="planned-title">Pro and Ultra are planned, not open.</h2>
          <p>
            They exist in the plan, not in the checkout. Published here so that when they arrive,
            nobody has to guess what they cost or what they are for.
          </p>
        </div>
        <div className="pricing-later-grid">
          {LATER_TIERS.map((tier) => (
            <article key={tier.name} className="pricing-later-plan">
              <div className="pricing-plan-heading">
                <h3>{tier.name}</h3>
                <span>{tier.price}</span>
              </div>
              <p>{tier.summary}</p>
              <ul>
                {tier.cells.map((cell) => (
                  <li key={cell}>{cell}</li>
                ))}
              </ul>
              <p className="pricing-payment-note">Not open for signup yet</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-section public-container" aria-labelledby="pricing-faq-title">
        <div className="pricing-section-copy">
          <Kicker index="04">· Straight answers</Kicker>
          <h2 id="pricing-faq-title">The awkward questions, first.</h2>
        </div>
        <dl className="pricing-faq-list">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="pricing-closing public-container" aria-labelledby="pricing-closing-title">
        <div className="pricing-closing-panel">
          <div>
            <h2 id="pricing-closing-title">
              Three is enough.
              <br />
              <em>Until it isn’t.</em>
            </h2>
            <p>
              Start on Free — no card, no trial clock. When the team outgrows it, the upgrade is one
              click away in Settings.
            </p>
          </div>
          <div className="pricing-closing-action">
            <Link
              href={hasSession ? "/settings" : "/signup"}
              className="public-button public-button-light"
            >
              {hasSession ? "Open Plan & billing" : "Get started"} <span aria-hidden>→</span>
            </Link>
            <p className="pricing-payment-note">
              Free · self-hostable
              <br />
              Your data, your server
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function PlanCard({ tier, ctaHref, ctaLabel }: { tier: Tier; ctaHref: string; ctaLabel: string }) {
  return (
    <article
      className={`pricing-plan${tier.featured ? " pricing-plan-featured" : ""}`}
      aria-labelledby={`plan-${tier.id}`}
    >
      <div className="pricing-plan-heading">
        <h2 id={`plan-${tier.id}`}>{tier.name}</h2>
        {tier.featured && <span className="pricing-recommended">Recommended</span>}
      </div>
      <p className="pricing-tagline">{tier.tagline}</p>
      <div className="pricing-price">
        <span>{tier.price}</span>
        {tier.cadence && <small>{tier.cadence}</small>}
      </div>
      <dl className="pricing-capacity">
        {tier.capacity.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="pricing-adds-label">{tier.addsLabel}</p>
      <ul className="pricing-adds">
        {tier.adds.map((item) => (
          <li key={item}>
            <Tick />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Link
        href={ctaHref}
        className={`pricing-plan-cta public-button ${tier.featured ? "public-button-light" : "public-button-secondary"}`}
      >
        {ctaLabel} <span aria-hidden>→</span>
      </Link>
    </article>
  );
}
