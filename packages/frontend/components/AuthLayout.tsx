import type { ReactNode } from "react";
import Link from "next/link";
import { LegalLinksLine } from "@/components/LegalLinksLine";

export function AuthLayout({
  title,
  description,
  mode = "login",
  children,
  alternateHref,
}: {
  title: string;
  description: string;
  mode?: "login" | "signup";
  children: ReactNode;
  alternateHref?: string;
}) {
  return (
    <main className="relative z-10 flex min-h-dvh flex-col px-5 py-6 sm:px-8 lg:px-12">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="Mokara home"
          className="flex items-center gap-2.5 text-[var(--color-ink)] no-underline"
        >
          <span className="grid size-9 place-items-center rounded-[var(--radius-icon)] border border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-accent)] shadow-[var(--shadow-xs)]">
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 18V6l7 8 7-8v12" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-[-0.04em]">Mokara</span>
        </Link>
        <Link
          href={alternateHref ?? (mode === "signup" ? "/login" : "/signup")}
          className="rounded-[var(--radius-btn)] px-2 py-2 text-sm font-medium text-[var(--color-ink-muted)] no-underline hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
        >
          {mode === "signup" ? "Sign in" : "Create an account"} <span aria-hidden="true">↗</span>
        </Link>
      </header>

      <div className="mx-auto grid w-full max-w-[1120px] flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20 lg:py-16">
        <aside className="hidden min-w-0 lg:block">
          <p className="mb-6 flex items-center gap-2 text-sm font-medium text-[var(--color-ink-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
            Your everyday workspace
          </p>
          <h2 className="m-0 max-w-[520px] text-[clamp(2.5rem,4.2vw,3.8rem)] font-medium leading-[1.1] tracking-[-0.055em]">
            A clearer view of
            <br />
            <span className="text-[var(--color-progress)]">what’s next.</span>
          </h2>
          <p className="mb-10 mt-6 max-w-[360px] text-base leading-7 text-[var(--color-ink-muted)]">
            Bring your tasks, your team and your progress into one calm place.
          </p>
          <div className="max-w-[390px] border-t border-[var(--color-border-strong)]">
            {[
              ["01", "Plan your day", "Keep the next task in sight."],
              ["02", "Work together", "Give everyone a shared direction."],
              ["03", "See your progress", "Follow the work as it moves forward."],
            ].map(([number, title, description]) => (
              <div
                key={number}
                className="flex items-start gap-5 border-b border-[var(--color-border-soft)] py-4"
              >
                <span className="pt-0.5 text-xs tabular-nums text-[var(--color-ink-muted)]">
                  {number}
                </span>
                <div>
                  <p className="m-0 text-sm font-medium">{title}</p>
                  <p className="mb-0 mt-1 text-sm text-[var(--color-ink-muted)]">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section
          aria-labelledby="auth-heading"
          className="card mx-auto w-full max-w-[440px] min-w-0 p-6 sm:p-9"
        >
          <div className="mb-7">
            <h1
              id="auth-heading"
              className="m-0 text-[1.9rem] font-medium leading-tight tracking-[-0.045em]"
            >
              {title}
            </h1>
            <p className="mb-0 mt-2 text-sm leading-6 text-[var(--color-ink-muted)]">
              {description}
            </p>
          </div>
          {children}
          <div className="mt-6 border-t border-[var(--color-border-soft)] pt-1 [&>p]:text-[var(--color-ink-muted)]">
            <LegalLinksLine
              lead={
                mode === "signup"
                  ? "By creating an account you agree to our"
                  : "Use of Mokara is governed by our"
              }
            />
          </div>
        </section>
      </div>
      <footer className="mx-auto w-full max-w-[1120px] text-xs text-[var(--color-ink-muted)]">
        A little less noise. A little more done.
      </footer>
    </main>
  );
}
