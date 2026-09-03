"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, type TeamInvitation } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useSession } from "@/lib/session";

export default function InvitationsPage() {
  const router = useRouter();
  const session = useSession();
  const [invites, setInvites] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, run } = useAsyncError();

  useEffect(() => {
    router.replace("/tasks");
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await run(() => api.listInvitations(), { fallback: "Failed to load invitations" });
    setLoading(false);
    if (res) setInvites(res.invitations);
  }, [run, setError]);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.push("/login");
      return;
    }
    if (session.status === "authed") load();
  }, [session.status, load, router]);

  async function respond(id: string, action: "accept" | "decline") {
    setError(null);
    const res = await run(() => api.respondToInvitation(id, action), {
      fallback: "Failed to respond",
    });
    if (!res) return;
    if (action === "accept" && res.team_id) {
      router.push(`/teams/${res.team_id}`);
      return;
    }
    await load();
  }

  return (
    <div className="flex flex-col gap-9">
      <header className="mt-2 flex flex-col gap-2">
        <h1 className="m-0 text-[clamp(1.6rem,4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em]">
          Invitations
        </h1>
        <p className="m-0 text-[0.98rem] text-[var(--color-ink-muted)]">
          Pending invites to join a team.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-[var(--radius-btn)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.08)] px-4 py-[0.7rem] text-[0.88rem] text-[var(--color-danger-ink)]">
          {error.message}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-[var(--color-ink-faint)]">Loading…</p>
      ) : invites.length === 0 ? (
        <div className="card py-9 px-6 text-center">
          <div className="relative mx-auto mb-[0.85rem] block size-12 rounded-full bg-[var(--color-accent-soft)] before:absolute before:inset-[18px] before:rounded-full before:border-2 before:border-[var(--color-accent)] before:content-['']" />
          <p className="m-0 mb-[0.3rem] text-[1rem] font-semibold">Nothing pending</p>
          <p className="m-0 text-[0.9rem] text-[var(--color-ink-muted)]">
            You have no open team invitations.
          </p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
          {invites.map((inv) => (
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
      )}
    </div>
  );
}
