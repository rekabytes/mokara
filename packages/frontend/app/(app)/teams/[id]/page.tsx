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
import { cn } from "@/lib/cn";

type Filter = "all" | TaskStatus;
const FILTERS: Filter[] = ["all", "todo", "in_progress", "done"];

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[var(--color-prio-high)]",
  medium: "bg-[var(--color-prio-medium)]",
  low: "bg-[var(--color-prio-low)]",
};

const STATUS_PILL: Record<TaskStatus, string> = {
  done: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
  todo: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
  in_progress: "bg-[var(--color-progress-soft)] text-[var(--color-progress)]",
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
      router.push("/dashboard");
      router.refresh();
    } catch (e: unknown) {
      setError(isApiError(e) ? e.message : "Failed to leave team");
    }
  }

  if (loading || !detail) {
    return (
      <p className="py-8 text-center text-[var(--color-ink-faint)]">
        {error ? error : "Loading…"}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-9">
      <header className="mt-2 flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/dashboard"
              className="mb-2 inline-block rounded-[9px] px-[0.7rem] py-[0.4rem] text-[0.88rem] text-[var(--color-ink-muted)] no-underline transition-colors duration-[160ms] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]"
            >
              ← Dashboard
            </Link>
            <h1 className="m-0 text-[clamp(1.6rem,4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em]">
              {detail.team.name}
            </h1>
            <p className="m-0 mt-2 flex items-center gap-[0.6rem] text-[0.98rem] text-[var(--color-ink-muted)]">
              @{detail.team.slug} · {detail.members.length}/3 members ·{" "}
              <span
                className={cn(
                  "pill",
                  detail.role === "owner"
                    ? "bg-[var(--color-progress-soft)] text-[var(--color-progress)]"
                    : "",
                )}
              >
                {detail.role}
              </span>
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-[var(--radius-btn)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.08)] px-4 py-[0.7rem] text-[0.88rem] text-[var(--color-danger-ink)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[320px_1fr] items-start gap-5 max-[800px]:grid-cols-1">
        <section className="panel-card sticky top-5 p-[1.1rem] pb-5 max-[800px]:static max-[800px]:top-auto">
          <h2 className="m-0 mb-[0.85rem] flex items-center gap-[0.6rem] text-[1rem] font-bold tracking-[-0.01em]">
            Members
            <span className="rounded-full bg-[var(--color-accent-soft)] px-[0.5rem] py-[0.15rem] text-[0.7rem] font-bold tracking-[0.02em] text-[var(--color-accent)]">
              {detail.members.length}/3
            </span>
          </h2>
          <ul className="m-0 mb-[0.4rem] flex list-none flex-col gap-[0.55rem] p-0">
            {detail.members.map((m) => (
              <li
                key={m.user_id}
                className="flex items-center gap-[0.7rem] rounded-[11px] border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-[0.65rem] py-[0.55rem]"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[0.85rem] font-semibold text-white">
                  {(m.display_name || m.username).slice(0, 1).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-[0.05rem]">
                  <span className="text-[0.92rem] font-semibold">
                    {m.display_name || m.username}
                  </span>
                  <span className="text-[0.76rem] text-[var(--color-ink-faint)]">
                    @{m.username}
                  </span>
                </div>
                <span
                  className={cn(
                    "pill",
                    m.role === "owner"
                      ? "bg-[var(--color-progress-soft)] text-[var(--color-progress)]"
                      : "",
                  )}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>

          {detail.members.length < 3 && (
            <>
              <h3 className="mt-5 mb-[0.6rem] text-[0.82rem] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                Invite by username
              </h3>
              <form onSubmit={invite} className="grid grid-cols-[1fr_auto] gap-2">
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
                  className="btn-base btn-primary"
                  disabled={!inviteUsername.trim()}
                >
                  Send
                </button>
              </form>
            </>
          )}

          {detail.invitations.length > 0 && (
            <>
              <h3 className="mt-5 mb-[0.6rem] text-[0.82rem] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                Pending invitations
              </h3>
              <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
                {detail.invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-[0.85rem] rounded-[9px] border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-[0.6rem] py-[0.45rem] text-[0.86rem]"
                  >
                    <span>@{inv.invitee_username}</span>
                    <span className="text-[0.78rem] text-[var(--color-ink-faint)]">
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
              className="btn-base btn-ghost btn-danger mt-4 w-full"
              onClick={leave}
            >
              Leave team
            </button>
          )}
          {detail.role === "owner" && detail.members.length > 1 && (
            <p className="m-0 mt-[0.85rem] text-[0.8rem] text-[var(--color-ink-faint)]">
              As owner you can&apos;t leave while other members exist.
            </p>
          )}
        </section>

        <section className="flex flex-col">
          <form
            onSubmit={createTask}
            className="card mb-5 grid grid-cols-[1fr_auto] gap-[10px] p-3 max-[480px]:grid-cols-1"
          >
            <input
              className="field col-start-1 row-start-1 font-medium"
              type="text"
              placeholder="Add a task…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Task title"
            />
            <input
              className="field col-span-full row-start-2"
              type="text"
              placeholder="Add a note (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Task description"
            />
            <button
              className="btn-base btn-primary self-stretch max-[480px]:col-span-full max-[480px]:justify-center"
              type="submit"
              disabled={!title.trim()}
            >
              Add
            </button>
          </form>

          <div
            role="tablist"
            aria-label="Filter tasks"
            className="mb-6 inline-flex gap-[4px] rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-[5px] shadow-[var(--shadow-xs)] backdrop-blur-[22px]"
          >
            {FILTERS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "cursor-pointer rounded-full border-0 bg-transparent px-[0.95rem] py-[0.45rem] text-[0.85rem] font-medium text-[var(--color-ink-muted)] transition-colors duration-[180ms] hover:text-[var(--color-ink)]",
                  filter === f &&
                    "bg-white text-[var(--color-ink)] shadow-[0_1px_3px_rgba(15,23,42,0.1)]",
                )}
              >
                {f === "all" ? "All" : titleCase(f)}
              </button>
            ))}
          </div>

          {tasks.length === 0 ? (
            <div className="card py-9 px-6 text-center">
              <div className="relative mx-auto mb-[0.85rem] block size-12 rounded-full bg-[var(--color-accent-soft)] before:absolute before:inset-[18px] before:rounded-full before:border-2 before:border-[var(--color-accent)] before:content-['']" />
              <p className="m-0 mb-[0.3rem] text-[1rem] font-semibold">No tasks here yet</p>
              <p className="m-0 text-[0.9rem] text-[var(--color-ink-muted)]">
                Add the first one above to get started.
              </p>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {tasks.map((t) => {
                const done = t.status === "done";
                return (
                  <li
                    key={t.id}
                    className={cn(
                      "card group flex items-start gap-[0.85rem] p-[1rem] py-[1.1rem]",
                      "transition-[transform,box-shadow,border-color] duration-[200ms]",
                      "hover:-translate-y-[2px] hover:shadow-[var(--shadow-lift)] hover:border-[var(--color-border-strong)]",
                      done && "opacity-90",
                    )}
                  >
                    <button
                      onClick={() => toggleTask(t)}
                      aria-label={done ? "Mark as not done" : "Mark as done"}
                      aria-pressed={done}
                      className={cn(
                        "grid size-6 shrink-0 cursor-pointer place-items-center rounded-full border-2 border-[var(--color-border-strong)] bg-transparent text-white transition-[background,border-color,transform] duration-[200ms] hover:scale-[1.08] hover:border-[var(--color-accent)]",
                        done && "border-[var(--color-accent)] bg-[var(--color-accent)]",
                      )}
                    >
                      <CheckIcon done={done} />
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col gap-[0.3rem]">
                      <span
                        className={cn(
                          "text-[0.98rem] font-semibold tracking-[-0.01em] break-words transition-[color,opacity] duration-[200ms]",
                          done && "text-[var(--color-ink-faint)] line-through",
                        )}
                      >
                        {t.title}
                      </span>
                      {t.description && (
                        <span
                          className={cn(
                            "text-[0.88rem] break-words text-[var(--color-ink-muted)]",
                            done && "opacity-60",
                          )}
                        >
                          {t.description}
                        </span>
                      )}
                      <div className="mt-[0.3rem] flex flex-wrap items-center gap-2 text-[0.76rem]">
                        <span className={cn("pill", STATUS_PILL[t.status])}>
                          {titleCase(t.status)}
                        </span>
                        <span className="inline-flex items-center gap-[0.32rem] text-[var(--color-ink-muted)] capitalize">
                          <span
                            className={cn(
                              "block size-[7px] rounded-full",
                              PRIORITY_DOT[t.priority] ?? PRIORITY_DOT.low,
                            )}
                          />
                          {t.priority}
                        </span>
                        {t.due_date && (
                          <span className="text-[var(--color-ink-faint)]">
                            · {formatDate(t.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeTask(t.id)}
                      aria-label="Delete task"
                      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-[9px] border border-transparent bg-transparent text-[var(--color-ink-faint)] opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100 hover:border-transparent hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:opacity-100 max-[480px]:opacity-100"
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
    </div>
  );
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
