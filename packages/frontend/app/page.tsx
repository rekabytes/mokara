"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, isApiError, type TeamWithRole, type TeamInvitation } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function HomePage() {
  const router = useRouter();
  const session = useSession();
  const [teams, setTeams] = useState<TeamWithRole[]>([]);
  const [invites, setInvites] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  async function handleRespond(id: string, action: "accept" | "decline") {
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

  if (session.status === "loading" || loading) {
    return (
      <main className="shell">
        <p className="empty">Loading…</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <TopBar
        username={session.status === "authed" ? session.user.username : ""}
        onLogout={async () => {
          await session.logout();
          router.push("/login");
        }}
      />

      <header className="hero">
        <h1 className="title">Your teams</h1>
        <p className="subtitle">Small, focused, up to 3 people each.</p>
      </header>

      {error && <div className="alert">{error}</div>}

      {invites.length > 0 && (
        <section className="card invites-card">
          <h2 className="section-title">
            Pending invitations
            <span className="badge">{invites.length}</span>
          </h2>
          <ul className="invite-list">
            {invites.map((inv) => (
              <li key={inv.id} className="invite-row">
                <div className="invite-body">
                  <strong>{inv.team_name ?? inv.team_id.slice(0, 8)}</strong>
                  <span className="invite-meta">
                    invited by {inv.inviter_name ?? inv.inviter_id.slice(0, 8)}
                  </span>
                </div>
                <div className="invite-actions">
                  <button
                    className="btn primary small"
                    onClick={() => handleRespond(inv.id, "accept")}
                  >
                    Accept
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => handleRespond(inv.id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="teams-section">
        <div className="section-head">
          <h2 className="section-title">Teams you&apos;re in</h2>
          <Link href="/teams/new" className="btn primary small">
            New team
          </Link>
        </div>

        {teams.length === 0 ? (
          <div className="card empty-state">
            <div className="empty-illu" />
            <p className="empty-title">No teams yet</p>
            <p className="empty-sub">
              Create your first team and invite up to two teammates.
            </p>
            <Link href="/teams/new" className="btn primary">
              Create a team
            </Link>
          </div>
        ) : (
          <ul className="team-list">
            {teams.map((t) => (
              <li key={t.id}>
                <Link href={`/teams/${t.id}`} className="card team-row">
                  <div className="team-row-body">
                    <span className="team-name">{t.name}</span>
                    <span className="team-slug">@{t.slug}</span>
                  </div>
                  <span className={`pill ${t.role === "owner" ? "owner" : "member"}`}>
                    {t.role}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="foot">Mokara · v2</footer>
    </main>
  );
}

function TopBar({
  username,
  onLogout,
}: {
  username: string;
  onLogout: () => void | Promise<void>;
}) {
  return (
    <nav className="topbar">
      <div className="brand">
        <span className="logo-dot" />
        <span className="brand-name">MOKARA</span>
      </div>
      <div className="topbar-right">
        <Link href="/invitations" className="topbar-link">
          Invitations
        </Link>
        <span className="topbar-user">@{username}</span>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => onLogout()}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}