import type { Metadata } from "next";
import Link from "next/link";
import Image, { type StaticImageData } from "next/image";
import { cookies } from "next/headers";
import { AmbientCanvas } from "@/components/AmbientCanvas";
import { HeroSplit } from "@/components/HeroSplit";
import { Reveal } from "@/components/Reveal";
import { TiltPanel } from "@/components/TiltPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AUTH_COOKIE } from "@/lib/cookies";
import shotDrawer from "../public/landing/shot-drawer.webp";
import shotTeam from "../public/landing/shot-team.webp";
import shotAnalytics from "../public/landing/shot-analytics.webp";

// The front door, v3: a designed page, not a template. Fraunces (display,
// italic accent) + Instrument Sans (body) + IBM Plex Mono (labels), self-hosted
// in the root layout; an ambient WebGL field behind everything; an asymmetric
// split hero; a mono ticker; zig-zag rows; a feature ledger. Pure server
// component except AmbientCanvas; the only dynamic read is the session cookie,
// which flips the navbar CTA. Header and footer are shared with the legal
// documents, so the public pages stay one system.
export const metadata: Metadata = {
  title: "Mokara — task boards for small teams",
  description:
    "Tasks, projects and weighted KPIs in one quiet board. Built for small teams; ships as Docker images.",
  openGraph: {
    title: "Mokara — task boards for small teams",
    description: "Tasks, projects and weighted KPIs in one quiet board.",
    images: ["/landing/og.jpg"],
  },
};

const TICKER = [
  "statuses",
  "priorities",
  "due dates",
  "projects",
  "weighted KPIs",
  "comments",
  "heatmap",
  "workspaces",
  "invitations",
  "self-hosted",
  "docker releases",
];

const LEDGER: [string, string][] = [
  ["01", "Threaded comments, one level deep, next to the task they're about"],
  ["02", "Flags for the tasks that need attention today"],
  ["03", "Filter, sort and group — remembered per view"],
  ["04", "Personal workspace becomes a team on the first accepted invite"],
  ["05", "Per-task KPI weights, capped at 100%"],
  ["06", "Archived projects stay out of the way, never deleted by accident"],
  ["07", "365-day deadline heatmap with hover detail on every cell"],
  ["08", "Docker images on every release tag — deploy is a pull"],
];

export default async function LandingPage() {
  const hasSession = (await cookies()).has(AUTH_COOKIE);
  const authHref = hasSession ? "/tasks" : "/login";
  const authLabel = hasSession ? "Open app" : "Log in";

  return (
    <main className="min-h-dvh font-body">
      <AmbientCanvas />

      <SiteHeader authHref={authHref} authLabel={authLabel} />

      {/* hero — type left, product right (contained card, no bleed) */}
      <section className="mx-auto max-w-6xl px-6 pt-14 sm:pt-20">
        <HeroSplit authHref={authHref} authLabel={authLabel} />
      </section>

      {/* mono ticker */}
      <div className="mt-14 overflow-hidden border-y border-[var(--color-border-soft)] py-3 sm:mt-20">
        <div className="ticker-track flex w-max animate-[ticker_46s_linear_infinite] items-center gap-8 whitespace-nowrap font-label text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} className="flex items-center gap-8">
              <span>{item}</span>
              <span aria-hidden className="text-[var(--color-accent)]">
                ·
              </span>
            </span>
          ))}
        </div>
      </div>

      <Row
        index="01"
        kicker="Context"
        title="Every task carries its conversation."
        body="Open a task and the thread is right there — comments beside the status, priority and due date they're about. Nothing to link, nothing to lose."
        items={[
          "Threaded replies, one level deep",
          "Author-only edit and delete",
          "Posts optimistically, no spinners",
        ]}
        image={shotDrawer}
        alt="A task drawer with status, priority and due-date chips, a project chip, weighted KPIs and a threaded comment"
        flip
        eager
      />
      <Row
        index="02"
        kicker="Weight"
        title="Progress you can weigh."
        body="Bind KPIs to tasks with weights; progress is the weighted share of work actually done — per project and per KPI, computed from real task states."
        items={[
          "Personal KPIs, team projects",
          "Per-task weights capped at 100%",
          "Archived projects stay out of the way",
        ]}
        image={shotTeam}
        alt="A workspace page with stacked project layers showing progress bars, beside the member list"
      />
      <Row
        index="03"
        kicker="Signal"
        title="Charts that answer, not decorate."
        body="A day-cell heatmap lays every task's runway against its deadline; activity lines are cumulative, so a quiet week still reads honestly."
        items={[
          "365-day heatmap, hover anywhere",
          "Cumulative created / done lines",
          "Trailing 14-day window, ending today",
        ]}
        image={shotAnalytics}
        alt="The day-cell progress heatmap with overdue, in-progress and upcoming states"
        flip
      />

      {/* feature ledger */}
      <section className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <p className="m-0 font-label text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
            <span className="text-[var(--color-accent)]">04</span> · Battery included
          </p>
          <h2 className="m-0 mt-3 font-display text-[2rem] font-semibold tracking-[-0.01em] sm:text-[2.4rem]">
            Everything else, already.
          </h2>
          <div className="mt-8 grid gap-x-12 sm:grid-cols-2">
            {LEDGER.map(([n, text]) => (
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
        </div>
      </section>

      {/* final CTA */}
      <section className="border-t border-[var(--color-border-soft)]">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-24">
          <h2 className="m-0 font-display text-[2.2rem] font-semibold tracking-[-0.01em] sm:text-[2.8rem]">
            Start alone. <em className="italic text-[var(--color-accent)]">Invite when ready.</em>
          </h2>
          <p className="mx-auto mt-4 mb-0 max-w-md text-[0.98rem] leading-relaxed text-[var(--color-ink-muted)]">
            Your workspace becomes a team the moment the first invitation is accepted — not before.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-[var(--radius-btn)] bg-[var(--color-accent)] px-6 py-3 text-[0.95rem] font-semibold text-white shadow-[var(--shadow-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Get started
          </Link>
          <p className="mb-0 mt-6 font-label text-[0.72rem] tracking-[0.06em] text-[var(--color-ink-faint)]">
            free · self-hostable · your data, your server
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function Row({
  index,
  kicker,
  title,
  body,
  items,
  image,
  alt,
  flip = false,
  eager = false,
}: {
  index: string;
  kicker: string;
  title: string;
  body: string;
  items: string[];
  image: StaticImageData;
  alt: string;
  flip?: boolean;
  // The first row's screenshot is Chrome's LCP element on this page — the hero
  // image starts at opacity 0 (its entrance animation), so invisible elements
  // are skipped and this one wins. Eager-loading it still satisfies LCP; the
  // lower rows stay lazy.
  eager?: boolean;
}) {
  return (
    <section className="border-t border-[var(--color-border-soft)]">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-12 md:grid-cols-12 md:gap-10 md:py-16">
        <div className={flip ? "md:order-2 md:col-span-5" : "md:col-span-5"}>
          <Reveal>
            <p className="m-0 flex items-baseline gap-2 font-label text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]">
              <span className="text-[var(--color-accent)]">{index}</span> {kicker}
            </p>
            <h2 className="m-0 mt-3 font-display text-[1.8rem] font-semibold leading-[1.12] tracking-[-0.01em]">
              {title}
            </h2>
            <p className="mb-0 mt-3 text-[0.98rem] leading-relaxed text-[var(--color-ink-muted)]">
              {body}
            </p>
            <ul className="m-0 mt-6 list-none p-0">
              {items.map((item) => (
                <li
                  key={item}
                  className="border-t border-[var(--color-border-soft)] py-2 text-[0.88rem] text-[var(--color-ink-muted)]"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
        <div className={flip ? "md:order-1 md:col-span-7" : "md:col-span-7"}>
          <Reveal>
            <TiltPanel className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] shadow-[var(--shadow-card)] transition-[box-shadow] duration-200 ease-[var(--ease-snap)] hover:shadow-[var(--shadow-lift)]">
              <Image
                src={image}
                alt={alt}
                className="h-auto w-full"
                unoptimized
                loading={eager ? "eager" : undefined}
              />
            </TiltPanel>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
