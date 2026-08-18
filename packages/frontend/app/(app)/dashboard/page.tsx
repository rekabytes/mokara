"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, isApiError, type TeamWithRole, type TeamInvitation } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDateLong(d = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const session = useSession();
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [invites, setInvites] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    router.replace("/tasks");
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, i] = await Promise.all([api.listTeams(), api.listInvitations()]);
      setTeams(t.teams);
      setInvites(i.invitations);
    } catch (e: unknown) {
      if (isApiError(e) && e.status === 401) {
        router.push("/login");
        return;
      }
      setError(isApiError(e) ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.push("/login");
      return;
    }
    if (session.status === "authed") load();
  }, [session.status, load, router]);

  async function respond(id: string, action: "accept" | "decline") {
    setError(null);
    try {
      const res = await api.respondToInvitation(id, action);
      if (action === "accept" && res.team_id) {
        router.push(`/teams/${res.team_id}`);
        return;
      }
      await load();
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to respond");
    }
  }

  const stats = useMemo(
    () => [
      { label: "Teams", value: teams.length, hint: teams.length === 1 ? "team" : "teams" },
      { label: "Pending invites", value: invites.length, hint: "awaiting you" },
      {
        label: "Owned by you",
        value: teams.filter((t) => t.role === "owner").length,
        hint: "as owner",
      },
    ],
    [teams, invites.length]
  );

  if (session.status !== "authed" || loading) {
    return <p className="py-8 text-center text-[var(--color-ink-faint)]">Loading…</p>;
  }

  const handle = session.user.display_name || session.user.username;

  return (
    <div className="flex flex-col gap-9">
      <header className="mt-2 flex flex-col gap-2">
        <p className="m-0 text-[0.78rem] font-semibold tracking-[0.08em] text-[var(--color-ink-faint)] uppercase">
          {formatDateLong()}
        </p>
        <h1 className="m-0 text-[clamp(1.6rem,4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em]">
          {timeOfDayGreeting()}, {handle}.
        </h1>
        <p className="m-0 text-[0.98rem] text-[var(--color-ink-muted)]">
          {teams.length === 0 && invites.length === 0
            ? "Create your first team to get started."
            : "Here's what's happening across your teams today."}
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-[var(--radius-btn)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.08)] px-4 py-[0.7rem] text-[0.88rem] text-[var(--color-danger-ink)]">
          {error}
        </div>
      )}

      <section className="grid grid-cols-3 gap-[0.85rem] max-[640px]:grid-cols-1">
        {stats.map((s) => (
          <div key={s.label} className="card flex flex-col gap-[0.15rem] px-[1.2rem] py-[1.1rem]">
            <span className="text-[1.85rem] font-bold leading-none tracking-[-0.03em]">
              {s.value}
            </span>
            <span className="mt-[0.4rem] text-[0.78rem] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
              {s.label}
            </span>
            <span className="text-[0.78rem] text-[var(--color-ink-faint)]">{s.hint}</span>
          </div>
        ))}
      </section>

      {invites.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="m-0 flex items-center gap-[0.6rem] text-[1rem] font-bold tracking-[-0.01em]">
              Pending invitations
              <span className="rounded-full bg-[var(--color-accent)] px-[0.5rem] py-[0.15rem] text-[0.7rem] font-bold tracking-[0.02em] text-white">
                {invites.length}
              </span>
            </h2>
            <Link
              href="/invitations"
              className="rounded-[9px] px-[0.7rem] py-[0.4rem] text-[0.88rem] text-[var(--color-ink-muted)] no-underline transition-colors duration-[160ms] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
            >
              See all
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
            {invites.slice(0, 3).map((inv) => (
              <li
                key={inv.id}
                className="card flex items-center justify-between gap-[0.85rem] px-[0.85rem] py-[0.7rem]"
              >
                <div className="flex min-w-0 flex-col gap-[0.15rem]">
                  <strong>{inv.team_name ?? inv.team_id.slice(0, 8)}</strong>
                  <span className="text-[0.78rem] text-[var(--color-ink-faint)]">
                    invited by {inv.inviter_name ?? inv.inviter_id.slice(0, 8)}
                  </span>
                </div>
                <div className="inline-flex shrink-0 gap-[0.4rem]">
                  <button
                    className="btn-base btn-primary btn-small"
                    onClick={() => respond(inv.id, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-base btn-ghost btn-small"
                    onClick={() => respond(inv.id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[1rem] font-bold tracking-[-0.01em]">Your teams</h2>
          <Link href="/teams/new" className="btn-base btn-primary btn-small">
            <PlusIcon />
            New team
          </Link>
        </div>

        {teams.length === 0 ? (
          <div className="card py-9 px-6 text-center">
            <div className="relative mx-auto mb-[0.85rem] block size-12 rounded-full bg-[var(--color-accent-soft)] before:absolute before:inset-[18px] before:rounded-full before:border-2 before:border-[var(--color-accent)] before:content-['']" />
            <p className="m-0 mb-[0.3rem] text-[1rem] font-semibold">No teams yet</p>
            <p className="m-0 text-[0.9rem] text-[var(--color-ink-muted)]">
              Create your first team and invite up to two teammates.
            </p>
            <Link href="/teams/new" className="btn-base btn-primary mt-[0.85rem] inline-flex">
              Create a team
            </Link>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
            {teams.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/teams/${t.id}`}
                  className={cn(
                    "card flex items-center justify-between px-[1.1rem] py-[0.95rem] text-inherit no-underline",
                    "transition-[transform,box-shadow,border-color] duration-[200ms]",
                    "hover:-translate-y-[2px] hover:shadow-[var(--shadow-lift)] hover:border-[var(--color-border-strong)]"
                  )}
                >
                  <div className="flex flex-col gap-[0.15rem]">
                    <span className="text-[1rem] font-semibold">{t.name}</span>
                    <span className="text-[0.82rem] text-[var(--color-ink-faint)]">@{t.slug}</span>
                  </div>
                  <span
                    className={cn(
                      "pill",
                      t.role === "owner"
                        ? "bg-[var(--color-progress-soft)] text-[var(--color-progress)]"
                        : ""
                    )}
                  >
                    {t.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
