"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.push("/login");
    }
  }, [session.status, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (session.status !== "authed") {
    return (
      <div className="fixed inset-0 grid place-items-center">
        <span className="block size-2 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
      </div>
    );
  }

  const user = session.user;
  const handle = user.display_name || user.username;

  const navItems: { href: string; label: string; icon: React.ReactNode }[] = [
    { href: "/tasks", label: "Tasks", icon: <TasksIcon /> },
    { href: "/analytics", label: "Analytics", icon: <AnalyticsIcon /> },
  ];

  return (
    <div
      className={cn(
        "relative z-10 grid min-h-screen grid-cols-[260px_1fr]",
        "max-[800px]:grid-cols-1"
      )}
    >
      <button
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={mobileNavOpen}
        onClick={() => setMobileNavOpen((v) => !v)}
        className="fixed top-3 left-3 z-20 hidden size-10 items-center justify-center rounded-[10px] border border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-card)] backdrop-blur-[22px] cursor-pointer max-[800px]:inline-flex"
      >
        <MenuIcon />
      </button>

      <aside
        className={cn(
          "sticky top-0 self-start h-screen z-10 flex flex-col pt-5 pr-4 pb-5 pl-5 border-r border-[var(--color-border-soft)] glass-blur",
          "max-[800px]:fixed max-[800px]:top-0 max-[800px]:left-0 max-[800px]:w-[280px] max-[800px]:h-screen max-[800px]:-translate-x-full max-[800px]:transition-transform max-[800px]:duration-[250ms] max-[800px]:shadow-[var(--shadow-lift)]",
          mobileNavOpen && "max-[800px]:translate-x-0"
        )}
      >
        <div className="mb-3">
          <Link
            href="/tasks"
            className="inline-flex w-fit items-center gap-[0.55rem] rounded-xl px-[0.7rem] py-[0.4rem] text-inherit no-underline"
          >
            <span className="block size-2 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
            <span className="text-[0.82rem] font-bold tracking-[0.06em] text-[var(--color-ink)]">
              MOKARA
            </span>
          </Link>
        </div>

        <nav className="mb-auto flex flex-col gap-1" aria-label="Primary">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-[0.7rem] rounded-[10px] px-[0.7rem] py-[0.55rem] text-[0.92rem] font-medium text-[var(--color-ink-muted)] no-underline transition-colors duration-[160ms]",
                  "hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]",
                  active &&
                    "bg-[var(--color-surface-solid)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(15,23,42,0.06),0_0_0_1px_var(--color-border-soft)]"
                )}
              >
                <span
                  className={cn(
                    "inline-flex shrink-0 text-[var(--color-ink-faint)]",
                    active && "text-[var(--color-accent)]"
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-[0.6rem] border-t border-[var(--color-border-soft)] pt-[0.85rem]">
          <div className="flex items-center gap-[0.65rem] rounded-[11px] px-[0.5rem] py-[0.45rem]">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[0.85rem] font-semibold text-white">
              {handle.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[0.9rem] font-semibold">{handle}</span>
              <span className="text-[0.76rem] text-[var(--color-ink-faint)]">@{user.username}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await session.logout();
              router.push("/login");
            }}
            className="btn-base btn-ghost w-full"
          >
            <LogoutIcon />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-[9] hidden cursor-pointer border-0 bg-[rgba(15,23,42,0.3)] p-0 max-[800px]:block"
        />
      )}

      <main className="w-full min-w-0 px-[clamp(1.5rem,4vw,3rem)] pt-4 pb-16 max-[800px]:pt-[4rem]">
        {children}
      </main>
    </div>
  );
}

function TasksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.5 12.5l2.5 2.5L16 9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3-4 3 2 4-6" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
