"use client";

import { useCallback, useEffect, useState, Fragment, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { api, type TeamDetail } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainerMeta } from "@/lib/meta";
import { useSession } from "@/lib/session";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageHeader } from "@/components/PageHeader";
import { snap, DUR } from "@/lib/motion";
import { cn } from "@/lib/cn";

import { LayersPanel } from "./LayersPanel";
import { LogoCard } from "./LogoCard";
import { RocketIcon } from "./team-icons";

// PRD-06: the liaison view — team layer (owner-created, shared) and each
// member's personal layer, grouped by owner. No linking; comparing is manual.
// Row actions (rename/archive/delete) are creator-or-leader; archived projects
// stay reachable via the "Archived" toggle so nothing silently disappears.

export default function TeamDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const teamId = params.id;
  const session = useSession();

  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { error, setError, run } = useAsyncError();
  const { projects, kpis, progress, refresh: refreshMeta } = useContainerMeta(teamId);

  const [inviteUsername, setInviteUsername] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const detail = await run(() => api.getTeam(teamId), { fallback: "Failed to load team" });
    setLoading(false);
    if (detail === null) return;
    setDetail(detail);
  }, [teamId, run, setError]);

  useEffect(() => {
    // Server sync only. The `anonymous → /login` half that used to sit here is
    // gone: AppShell is this page's parent and already redirects during
    // render, so a signed-out visitor never reaches this effect.
    if (session.status === "authed") load();
  }, [session.status, load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    const u = inviteUsername.trim().toLowerCase();
    if (!u) return;
    setError(null);
    const res = await run(() => api.inviteToTeam(teamId, { username: u }), {
      fallback: "Failed to invite",
    });
    if (!res) return;
    setInviteUsername("");
    await load();
  }

  async function leave() {
    if (!confirm("Leave this team?")) return;
    const ok = await run(() => api.leaveTeam(teamId), { fallback: "Failed to leave team" });
    if (ok === null) return;
    router.push("/tasks");
    router.refresh();
  }

  if (loading || !detail) {
    return (
      <p className="py-8 text-center text-[var(--color-ink-faint)]">
        {error ? error.message : "Loading…"}
      </p>
    );
  }

  const isWorkspace = detail.team.kind === "workspace";

  return (
    <div className="flex flex-col gap-6">
      {/* Top bar: breadcrumb + actions — copied from the Tasks page header */}
      <PageHeader>{detail.team.name}</PageHeader>

      <ErrorBanner className="mb-4" message={error?.message} />

      <div className="grid grid-cols-[1fr_300px] items-start gap-4 max-[800px]:grid-cols-1">
        <section className="flex flex-col">
          <LayersPanel
            container={detail.team}
            role={detail.role}
            currentUsername={session.status === "authed" ? session.user.username : ""}
            projects={projects}
            kpis={kpis}
            progress={progress}
            onAdd={async (kind, name, scope, color) => {
              const ok =
                kind === "project"
                  ? await run(() => api.createProject(teamId, { name, scope, color }), {
                      fallback: "Failed to create project",
                    })
                  : await run(() => api.createKpi(teamId, { name }), {
                      fallback: "Failed to create KPI",
                    });
              if (ok === null) return false;
              await refreshMeta();
              return true;
            }}
            onRename={async (kind, id, name) => {
              const ok =
                kind === "project"
                  ? await run(() => api.updateProject(id, { name }), {
                      fallback: "Failed to rename project",
                    })
                  : await run(() => api.updateKpi(id, { name }), {
                      fallback: "Failed to rename KPI",
                    });
              if (ok === null) return false;
              await refreshMeta();
              return true;
            }}
            onArchive={async (id, archived) => {
              const ok = await run(() => api.updateProject(id, { archived }), {
                fallback: archived ? "Failed to archive project" : "Failed to unarchive project",
              });
              if (ok === null) return false;
              await refreshMeta();
              return true;
            }}
            onDelete={async (kind, id) => {
              const ok =
                kind === "project"
                  ? await run(() => api.deleteProject(id), {
                      fallback: "Failed to delete project",
                    })
                  : await run(() => api.deleteKpi(id), {
                      fallback: "Failed to delete KPI",
                    });
              if (ok === null) return false;
              await refreshMeta();
              return true;
            }}
          />
        </section>
        <aside className="flex flex-col gap-4">
          {/* PRD-11: container identity (logo + leader controls) leads the rail. */}
          <LogoCard
            team={detail.team}
            canManage={detail.role === "owner"}
            onTeam={(updated) => setDetail((prev) => (prev ? { ...prev, team: updated } : prev))}
          />
          {isWorkspace ? (
            <>
              <div className="rounded-[16px] border border-[rgba(99,102,241,0.25)] bg-[linear-gradient(135deg,rgba(99,102,241,0.09),rgba(14,165,233,0.07))] p-4">
                <h2 className="m-0 flex items-center gap-1.5 text-[0.95rem] font-bold tracking-[-0.01em]">
                  <RocketIcon />
                  Make this a team
                </h2>
                <p className="mb-3 mt-1.5 text-[0.8rem] leading-[1.5] text-[var(--color-ink-muted)]">
                  Invite someone — the moment they <b>accept</b>, this workspace becomes a{" "}
                  <b>team</b>: everything here is shared with them, and you unlock{" "}
                  <b>team projects &amp; KPIs</b> as the leader.
                </p>
                <form onSubmit={invite} className="flex gap-2">
                  <input
                    className="field min-w-0 flex-1"
                    type="text"
                    placeholder="@username"
                    value={inviteUsername}
                    onChange={(e) =>
                      setInviteUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                    }
                    maxLength={20}
                    aria-label="Username to invite"
                  />
                  <button
                    type="submit"
                    className="btn-base btn-primary"
                    disabled={!inviteUsername.trim()}
                  >
                    Invite
                  </button>
                </form>
              </div>
              <div className="card p-4">
                <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--color-ink-faint)]">
                  Just you
                </div>
                {detail.members.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-2.5 px-0.5 py-1">
                    <div className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[13.5px] font-bold text-white">
                      {(m.display_name || m.username).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold">
                        {m.display_name || m.username}
                      </b>
                      <span className="text-[11.5px] text-[var(--color-ink-faint)]">
                        @{m.username}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-[rgba(99,102,241,0.1)] px-2 py-[2px] text-[10.5px] font-bold text-[var(--color-accent)]">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[1rem] font-bold tracking-[-0.01em]">Members</h2>
                <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-[2px] text-[0.7rem] font-bold text-[var(--color-accent)]">
                  {/* PRD-11: the cap is the leader's plan's, and null means
                      unlimited — a bare count beats a fake "/ ∞". */}
                  {detail.team.member_limit === null
                    ? detail.members.length
                    : `${detail.members.length} / ${detail.team.member_limit}`}
                </span>
              </div>
              <div className="flex flex-col">
                {detail.members.map((m) => (
                  <motion.div
                    key={m.user_id}
                    // Accepting an invitation or adding a member re-orders this
                    // rail; rows slide instead of teleporting.
                    layout="position"
                    transition={snap(DUR.base)}
                    className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-[0.45rem] transition-colors duration-[120ms] hover:bg-[var(--color-surface-2)]"
                  >
                    <div className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[13.5px] font-bold text-white">
                      {(m.display_name || m.username).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold">
                        {m.display_name || m.username}
                      </b>
                      <span className="text-[11.5px] text-[var(--color-ink-faint)]">
                        @{m.username}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-[2px] text-[10.5px] font-bold",
                        m.role === "owner"
                          ? "bg-[rgba(99,102,241,0.1)] text-[var(--color-accent)]"
                          : "bg-[rgba(148,163,184,0.14)] text-[var(--color-ink-muted)]"
                      )}
                    >
                      {m.role}
                    </span>
                  </motion.div>
                ))}
              </div>
              {detail.members.length < 3 && (
                <>
                  <form onSubmit={invite} className="mt-3 flex gap-2">
                    <input
                      className="field min-w-0 flex-1"
                      type="text"
                      placeholder="@username"
                      value={inviteUsername}
                      onChange={(e) =>
                        setInviteUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                      }
                      maxLength={20}
                      aria-label="Username to invite"
                    />
                    <button
                      type="submit"
                      className="btn-base btn-primary"
                      disabled={!inviteUsername.trim()}
                    >
                      Invite
                    </button>
                  </form>
                  <p className="mb-0 mt-2 px-1.5 text-[0.72rem] text-[var(--color-ink-faint)]">
                    {3 - detail.members.length} seats free · they join the moment they accept
                  </p>
                </>
              )}
              {detail.invitations.length > 0 && (
                <p className="mb-0 mt-2.5 px-1.5 text-[0.72rem] text-[var(--color-ink-faint)]">
                  Invited: {detail.invitations.map((inv) => `@${inv.invitee_username}`).join(", ")}
                </p>
              )}
              <button
                type="button"
                onClick={leave}
                className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-[0.72rem] text-[var(--color-ink-faint)] transition-colors duration-[120ms] hover:text-[var(--color-danger)]"
              >
                Leave team
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
