"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  isApiError,
  type Task,
  type TaskStatus,
  type Team,
  type TeamMember,
  type TeamInvitation,
} from "@/lib/api";
import { useSession } from "@/lib/session";

type Filter = "all" | TaskStatus;
const FILTERS: Filter[] = ["all", "todo", "in_progress", "done"];
const PRIORITY_CLASS: Record<string, string> = {
  high: "prio-high",
  medium: "prio-medium",
  low: "prio-low",
};

const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type Detail = {
  team: Team;
  role: "owner" | "member";
  members: TeamMember[];
  invitations: TeamInvitation[];
};

export default function TeamDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const teamId = params.id;
  const session = useSession();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [inviteUsername, setInviteUsername] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, t] = await Promise.all([
        api.getTeam(teamId),
        api.listTeamTasks(teamId, filter === "all" ? undefined : filter),
      ]);
      setDetail(d);
      setTasks(t);
    } catch (e: unknown) {
      if (isApiError(e) && e.status === 401) {
        router.push("/login");
        return;
      }
      if (isApiError(e) && e.status === 403) {
        setError("You are not a member of this team.");
      } else {
        setError(isApiError(e) ? e.message : "Failed to load team");
      }
    } finally {
      setLoading(false);
    }
  }, [teamId, filter, router]);

  useEffect(() => {
    if (session.status === "anonymous") {
      router.push("/login");
      return;
    }
    if (session.status === "authed") load();
  }, [session.status, load, router]);

  async function createTask(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      const created = await api.createTeamTask(teamId, {
        title: title.trim(),
        description: description.trim(),
      });
      setTasks((prev) => [created, ...prev]);
      setTitle("");
      setDescription("");
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to create task");
    }
  }

  async function toggleTask(t: Task) {
    const next: TaskStatus = t.status === "done" ? "todo" : "done";
    try {
      const updated = await api.updateTask(t.id, { status: next });
      setTasks((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to update task");
    }
  }

  async function removeTask(id: string) {
    try {
      await api.deleteTask(id);
      setTasks((prev) => prev.filter((x) => x.id !== id));
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to delete task");
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    const u = inviteUsername.trim().toLowerCase();
    if (!u) return;
    setError(null);
    try {
      await api.inviteToTeam(teamId, { username: u });
      setInviteUsername("");
      await load();
    } catch (e: unknown) {
      if (isApiError(e)) {
        if (e.error === "team_full") {
          setError("Team is already full (3 members).");
        } else if (e.error === "already_member") {
          setError("That user is already a member.");
        } else if (e.error === "already_invited") {
          setError("That user already has a pending invitation.");
        } else if (e.error === "user_not_found") {
          setError("No user with that username.");
        } else {
          setError(e.message);
        }
      } else {
        setError("Failed to invite");
      }
    }
  }

  async function leave() {
    if (!confirm("Leave this team?")) return;
    try {
      await api.leaveTeam(teamId);
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to leave team");
    }
  }

  if (loading || !detail) {
    return (
      <main className="shell">
        <p className="empty">{error ? error : "Loading…"}</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <nav className="topbar">
        <Link href="/" className="brand">
          <span className="logo-dot" />
          <span className="brand-name">MOKARA</span>
        </Link>
        <div className="topbar-right">
          <Link href="/invitations" className="topbar-link">
            Invitations
          </Link>
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
        <h1 className="title">{detail.team.name}</h1>
        <p className="subtitle">
          @{detail.team.slug} · {detail.members.length}/3 members ·{" "}
          <span className={`pill ${detail.role === "owner" ? "owner" : "member"}`}>
            {detail.role}
          </span>
        </p>
      </header>

      {error && <div className="alert">{error}</div>}

      <div className="grid">
        {/* ---- Members + Invitations ---- */}
        <section className="card panel">
          <h2 className="section-title">
            Members
            <span className="badge subtle">{detail.members.length}/3</span>
          </h2>
          <ul className="member-list">
            {detail.members.map((m) => (
              <li key={m.user_id} className="member-row">
                <div className="member-avatar">
                  {(m.display_name || m.username).slice(0, 1).toUpperCase()}
                </div>
                <div className="member-body">
                  <span className="member-name">
                    {m.display_name || m.username}
                  </span>
                  <span className="member-username">@{m.username}</span>
                </div>
                <span className={`pill ${m.role === "owner" ? "owner" : "member"}`}>
                  {m.role}
                </span>
              </li>
            ))}
          </ul>

          {detail.members.length < 3 && (
            <>
              <h3 className="section-subtitle">Invite by username</h3>
              <form onSubmit={invite} className="invite-form">
                <input
                  className="field"
                  type="text"
                  placeholder="@username"
                  value={inviteUsername}
                  onChange={(e) =>
                    setInviteUsername(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    )
                  }
                  maxLength={20}
                />
                <button
                  type="submit"
                  className="btn primary"
                  disabled={!inviteUsername.trim()}
                >
                  Send
                </button>
              </form>
            </>
          )}

          {detail.invitations.length > 0 && (
            <>
              <h3 className="section-subtitle">Pending invitations</h3>
              <ul className="invite-list">
                {detail.invitations.map((inv) => (
                  <li key={inv.id} className="invite-row compact">
                    <span>@{inv.invitee_username}</span>
                    <span className="invite-meta">
                      expires {formatDate(inv.expires_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {detail.role !== "owner" && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={leave}
            >
              Leave team
            </button>
          )}
          {detail.role === "owner" && detail.members.length > 1 && (
            <p className="hint">
              As owner you can&apos;t leave while other members exist.
            </p>
          )}
        </section>

        {/* ---- Tasks ---- */}
        <section className="tasks-panel">
          <form className="card composer" onSubmit={createTask}>
            <input
              className="field title-field"
              type="text"
              placeholder="Add a task…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Task title"
            />
            <input
              className="field desc-field"
              type="text"
              placeholder="Add a note (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Task description"
            />
            <button
              className="btn primary add-btn"
              type="submit"
              disabled={!title.trim()}
            >
              Add
            </button>
          </form>

          <div className="segmented" role="tablist" aria-label="Filter tasks">
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={`seg ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : titleCase(f)}
              </button>
            ))}
          </div>

          {tasks.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-illu" />
              <p className="empty-title">No tasks here yet</p>
              <p className="empty-sub">
                Add the first one above to get started.
              </p>
            </div>
          ) : (
            <ul className="task-list">
              {tasks.map((t) => {
                const done = t.status === "done";
                return (
                  <li key={t.id} className={`card task ${done ? "is-done" : ""}`}>
                    <button
                      className={`check ${done ? "checked" : ""}`}
                      onClick={() => toggleTask(t)}
                      aria-label={done ? "Mark as not done" : "Mark as done"}
                      aria-pressed={done}
                    >
                      <CheckIcon done={done} />
                    </button>
                    <div className="task-body">
                      <span className="task-title">{t.title}</span>
                      {t.description && (
                        <span className="task-desc">{t.description}</span>
                      )}
                      <div className="meta">
                        <span className={`pill status ${t.status}`}>
                          {titleCase(t.status)}
                        </span>
                        <span
                          className={`prio ${PRIORITY_CLASS[t.priority] ?? "prio-low"}`}
                        >
                          <span className="dot" />
                          {t.priority}
                        </span>
                        {t.due_date && (
                          <span className="due">· {formatDate(t.due_date)}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="icon-btn"
                      onClick={() => removeTask(t.id)}
                      aria-label="Delete task"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <footer className="foot">Mokara · v2</footer>
    </main>
  );
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={done ? 1 : 0}
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}