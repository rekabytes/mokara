"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, isApiError, type TeamInvitation } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function InvitationsPage() {
  const router = useRouter();
  const session = useSession();
  const [invites, setInvites] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { invitations } = await api.listInvitations();
      setInvites(invitations);
    } catch (e: unknown) {
      if (isApiError(e) && e.status === 401) {
        router.push("/login");
        return;
      }
      setError(isApiError(e) ? e.message : "Failed to load");
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

  return (
    <main className="shell">
      <nav className="topbar">
        <Link href="/" className="brand">
          <span className="logo-dot" />
          <span className="brand-name">MOKARA</span>
        </Link>
        <div className="topbar-right">
          {session.status === "authed" && (
            <>
              <span className="topbar-user">@{session.user.username}</span>
              <button
                type="button"
                className="btn ghost small"
                onClick={async () => {
                  await session.logout();
                  router.push("/login");
                }}
              >
                Log out
              </button>
            </>
          )}
        </div>
      </nav>

      <header className="hero">
        <h1 className="title">Invitations</h1>
        <p className="subtitle">Pending invites to join a team.</p>
      </header>

      {error && <div className="alert">{error}</div>}

      {loading ? (
        <p className="empty">Loading…</p>
      ) : invites.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-illu" />
          <p className="empty-title">Nothing pending</p>
          <p className="empty-sub">You have no open team invitations.</p>
        </div>
      ) : (
        <ul className="invite-list">
          {invites.map((inv) => (
            <li key={inv.id} className="card invite-row">
              <div className="invite-body">
                <strong>{inv.team_name ?? inv.team_id.slice(0, 8)}</strong>
                <span className="invite-meta">
                  invited by {inv.inviter_name ?? inv.inviter_id.slice(0, 8)}
                </span>
              </div>
              <div className="invite-actions">
                <button
                  className="btn primary small"
                  onClick={() => respond(inv.id, "accept")}
                >
                  Accept
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => respond(inv.id, "decline")}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="foot">Mokara · v2</footer>
    </main>
  );
}