"use client";

import { useCallback, useEffect, useState, Fragment, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  api,
  type Team,
  type TeamMember,
  type TeamInvitation,
  type Project,
  type Kpi,
  type KpiProgress,
  type ContainerScope,
} from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { useContainerMeta } from "@/lib/meta";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/cn";

// PRD-06: the liaison view — team layer (owner-created, shared) and each
// member's personal layer, grouped by owner. No linking; comparing is manual.
// Row actions (rename/archive/delete) are creator-or-leader; archived projects
// stay reachable via the "Archived" toggle so nothing silently disappears.

const SWATCHES = [
  "#6366f1",
  "#0ea5e9",
  "#15803d",
  "#ef4444",
  "#a16207",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
];

function LayersPanel({
  container,
  role,
  currentUsername,
  projects,
  kpis,
  progress,
  onAdd,
  onRename,
  onArchive,
  onDelete,
}: {
  container: Team;
  role: "owner" | "member";
  currentUsername: string;
  projects: Project[];
  kpis: Kpi[];
  progress: KpiProgress[];
  onAdd: (
    kind: "project" | "kpi",
    name: string,
    scope: ContainerScope,
    color?: string
  ) => Promise<boolean>;
  onRename: (kind: "project" | "kpi", id: string, name: string) => Promise<boolean>;
  onArchive: (id: string, archived: boolean) => Promise<boolean>;
  onDelete: (kind: "project" | "kpi", id: string) => Promise<boolean>;
}) {
  const [projName, setProjName] = useState("");
  const [kpiName, setKpiName] = useState("");
  const [projScope, setProjScope] = useState<ContainerScope>("personal");
  const [projColor, setProjColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const isWorkspace = container.kind === "workspace";
  const canTeamScope = !isWorkspace && role === "owner";
  const progressById = new Map(progress.map((p) => [p.id, p]));

  async function submit(kind: "project" | "kpi", name: string, scope: ContainerScope) {
    const trimmed = name.trim();
    if (!trimmed || busy) return false;
    setBusy(true);
    const ok = await onAdd(
      kind,
      trimmed,
      canTeamScope ? scope : "personal",
      kind === "project" ? (projColor ?? undefined) : undefined
    ); // KPIs ignore scope — always personal
    setBusy(false);
    if (ok) {
      if (kind === "project") {
        setProjName("");
        setProjColor(null);
      } else {
        setKpiName("");
      }
    }
    return ok;
  }

  // Team projects first, then personal items grouped per owner (the viewer's
  // group leads); archived last, behind the toggle. KPIs have no team layer —
  // they are always personal, so they only ever group by owner.
  function groupByOwner<T extends { owner_username: string; archived?: boolean }>(items: T[]) {
    const active = items.filter((i) => !(i.archived ?? false));
    const archivedList = items.filter((i) => i.archived ?? false);
    const owners = new Map<string, T[]>();
    for (const i of active) {
      const list = owners.get(i.owner_username) ?? [];
      list.push(i);
      owners.set(i.owner_username, list);
    }
    const ownerKeys = [...owners.keys()].sort((a, b) =>
      a === currentUsername ? -1 : b === currentUsername ? 1 : a.localeCompare(b)
    );
    return { ownerKeys, owners, archivedList };
  }

  const pgTeam = projects.filter((p) => p.scope === "team" && !p.archived);
  const pg = groupByOwner(projects.filter((p) => p.scope === "personal"));
  const pgArchived = projects.filter((p) => p.archived);
  const kg = groupByOwner(kpis);

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="m-0 flex items-center gap-2 text-[0.9rem] font-bold tracking-[-0.01em]">
            {isWorkspace ? "My Projects" : "Projects"}
            <span className="count">{projects.filter((p) => !p.archived).length}</span>
          </h3>
          {pg.archivedList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
              className={cn(
                "cursor-pointer rounded-full border px-2 py-[0.15rem] text-[0.7rem] font-medium transition-colors duration-[120ms]",
                showArchived
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-border-soft)] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
              )}
            >
              Archived ({pgArchived.length})
            </button>
          )}
        </div>
        <ul className="m-0 mb-3 flex max-h-[300px] list-none flex-col gap-1.5 overflow-y-auto p-0">
          {pgTeam.length > 0 && <GroupLabel>Team</GroupLabel>}
          {pgTeam.map((p) => (
            <LayerRow
              key={p.id}
              kind="project"
              name={p.name}
              color={p.color}
              badge="Team"
              progressPct={p.task_count ? Math.round((p.task_done_count / p.task_count) * 100) : 0}
              count={`${p.task_count} tasks`}
              archived={false}
              canManage={p.owner_id === currentUsername || role === "owner"}
              onRename={(n) => onRename("project", p.id, n)}
              onArchive={(a) => onArchive(p.id, a)}
              onDelete={() => onDelete("project", p.id)}
            />
          ))}
          {pg.ownerKeys.map((owner) => (
            <Fragment key={owner}>
              <GroupLabel>
                {owner}
                {owner === currentUsername ? " (you)" : ""}
              </GroupLabel>
              {(pg.owners.get(owner) ?? []).map((p) => (
                <LayerRow
                  key={p.id}
                  kind="project"
                  name={p.name}
                  color={p.color}
                  badge="personal"
                  progressPct={
                    p.task_count ? Math.round((p.task_done_count / p.task_count) * 100) : 0
                  }
                  count={`${p.task_count} tasks`}
                  archived={false}
                  canManage={p.owner_id === currentUsername || role === "owner"}
                  onRename={(n) => onRename("project", p.id, n)}
                  onArchive={(a) => onArchive(p.id, a)}
                  onDelete={() => onDelete("project", p.id)}
                />
              ))}
            </Fragment>
          ))}
          {showArchived &&
            pgArchived.map((p) => (
              <LayerRow
                key={p.id}
                kind="project"
                name={p.name}
                color={p.color}
                badge="archived"
                count={String(p.task_count)}
                archived={true}
                canManage={p.owner_id === currentUsername || role === "owner"}
                onRename={(n) => onRename("project", p.id, n)}
                onArchive={(a) => onArchive(p.id, a)}
                onDelete={() => onDelete("project", p.id)}
              />
            ))}
          {projects.length === 0 && (
            <li className="text-[0.8rem] text-[var(--color-ink-faint)]">None yet.</li>
          )}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit("project", projName, projScope);
          }}
          className="grid grid-cols-[1fr_auto] gap-2"
        >
          <input
            className="field"
            type="text"
            placeholder="New project…"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
            maxLength={50}
            aria-label="New project name"
          />
          <button
            className="btn-base btn-primary"
            type="submit"
            disabled={!projName.trim() || busy}
          >
            Add
          </button>
          <div className="col-span-full flex items-center gap-1.5 pt-1">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={projColor === c}
                onClick={() => setProjColor(projColor === c ? null : c)}
                className={cn(
                  "size-[18px] shrink-0 cursor-pointer rounded-full border-2 transition-transform duration-[120ms] hover:scale-110",
                  projColor === c ? "border-[var(--color-ink)]" : "border-transparent"
                )}
                style={{ background: c }}
              />
            ))}
            <span className="ml-1 text-[0.7rem] text-[var(--color-ink-faint)]">
              color (optional)
            </span>
          </div>
          {canTeamScope && (
            <div className="col-span-full flex gap-1.5 pt-1">
              <ScopeToggle
                active={projScope === "personal"}
                label="Personal"
                onClick={() => setProjScope("personal")}
              />
              <ScopeToggle
                active={projScope === "team"}
                label="Team"
                onClick={() => setProjScope("team")}
              />
            </div>
          )}
        </form>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="m-0 flex items-center gap-2 text-[0.9rem] font-bold tracking-[-0.01em]">
            {isWorkspace ? "My KPIs" : "KPIs"}
            <span className="count">{kpis.length}</span>
          </h3>
        </div>
        <ul className="m-0 mb-3 flex list-none flex-col gap-1.5 p-0">
          {kg.ownerKeys.map((owner) => (
            <Fragment key={owner}>
              <GroupLabel>
                {owner}
                {owner === currentUsername ? " (you)" : ""}
              </GroupLabel>
              {(kg.owners.get(owner) ?? []).map((k) => (
                <LayerRow
                  key={k.id}
                  kind="kpi"
                  name={k.name}
                  color={null}
                  badge=""
                  progressPct={progressById.get(k.id)?.progress}
                  count={`${k.binding_count} tied`}
                  archived={false}
                  canManage={k.owner_id === currentUsername || role === "owner"}
                  onRename={(n) => onRename("kpi", k.id, n)}
                  onDelete={() => onDelete("kpi", k.id)}
                />
              ))}
            </Fragment>
          ))}
          {kpis.length === 0 && (
            <li className="text-[0.8rem] text-[var(--color-ink-faint)]">None yet.</li>
          )}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit("kpi", kpiName, "personal");
          }}
          className="grid grid-cols-[1fr_auto] gap-2"
        >
          <input
            className="field"
            type="text"
            placeholder="New KPI…"
            value={kpiName}
            onChange={(e) => setKpiName(e.target.value)}
            maxLength={60}
            aria-label="New KPI name"
          />
          <button className="btn-base btn-primary" type="submit" disabled={!kpiName.trim() || busy}>
            Add
          </button>
        </form>
      </div>

      {isWorkspace && (
        <p className="col-span-full m-0 -mt-2 text-[0.76rem] text-[var(--color-ink-faint)] max-[900px]:col-span-1">
          🔒 Team projects &amp; KPIs unlock when this workspace becomes a team — invite someone and
          they take effect the moment they accept.
        </p>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-0.5 pb-0.5 pt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[var(--color-ink-faint)]">
      {children}
    </li>
  );
}

// One layer row with hover actions: rename (inline), archive/unarchive
// (projects only), delete. Actions appear on hover for members, always for
// rows the viewer manages.
function LayerRow({
  kind,
  name,
  color,
  badge,
  count,
  progressPct,
  archived,
  canManage,
  onRename,
  onArchive,
  onDelete,
}: {
  kind: "project" | "kpi";
  name: string;
  color: string | null;
  badge: string;
  count: string;
  progressPct?: number;
  archived: boolean;
  canManage: boolean;
  onRename: (name: string) => Promise<boolean>;
  onArchive?: (archived: boolean) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [busy, setBusy] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return false;
    setBusy(true);
    const ok = await onRename(trimmed);
    setBusy(false);
    if (ok) setEditing(false);
    return ok;
  }

  async function remove() {
    if (busy) return;
    if (
      !confirm(
        `Delete ${kind} "${name}"?${archived ? "" : " (it stays visible under Archived if it has tasks)"}`
      )
    )
      return;
    setBusy(true);
    await onDelete();
    setBusy(false);
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-2 rounded-[9px] border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[0.84rem]",
        archived && "opacity-60"
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: color ?? "var(--color-ink-faint)" }}
      />
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            className="field min-w-0 flex-1"
            type="text"
            value={draft}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(name);
              }
            }}
            aria-label="Rename"
          />
          <button className="btn-base btn-primary" type="submit" disabled={busy || !draft.trim()}>
            Save
          </button>
          <button
            type="button"
            className="btn-base btn-ghost"
            onClick={() => {
              setEditing(false);
              setDraft(name);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="pill shrink-0">{badge}</span>
          {progressPct !== undefined && (
            <>
              <span className="h-1 w-[110px] shrink-0 overflow-hidden rounded-[999px] bg-[rgba(148,163,184,0.22)]">
                <span
                  className={cn(
                    "block h-full rounded-[999px]",
                    kind === "project" ? "bg-[var(--color-success)]" : "bg-[var(--color-accent)]"
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </span>
              <span className="w-[34px] shrink-0 text-right text-[12px] font-semibold text-[var(--color-ink-muted)]">
                {progressPct}%
              </span>
            </>
          )}
          <span className="shrink-0 font-mono text-[0.72rem] text-[var(--color-ink-faint)]">
            {count}
          </span>
          {canManage && (
            <div
              className={cn(
                "flex shrink-0 items-center gap-0.5 transition-opacity duration-[140ms]",
                "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
              )}
            >
              <button
                type="button"
                aria-label={`Rename ${name}`}
                title="Rename"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
              >
                <PencilIcon />
              </button>
              {onArchive && (
                <button
                  type="button"
                  aria-label={archived ? `Unarchive ${name}` : `Archive ${name}`}
                  title={archived ? "Unarchive" : "Archive"}
                  onClick={() => void onArchive(!archived)}
                  className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                >
                  {archived ? <UnarchiveIcon /> : <ArchiveIcon />}
                </button>
              )}
              <button
                type="button"
                aria-label={`Delete ${name}`}
                title="Delete"
                onClick={() => void remove()}
                className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
              >
                <TrashIcon />
              </button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function PencilIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M13.5 6.5l3 3" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function UnarchiveIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
      <path d="M12 16v-5M9.5 13.5L12 11l2.5 2.5" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1.1 6L12 17.3 6.6 20l1.1-6L3.3 9.9l6-.9L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 16V11a6 6 0 1112 0v5l1.5 2H4.5L6 16z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ScopeToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition-colors duration-[120ms]",
        active
          ? "border-[var(--color-accent)] bg-[rgba(99,102,241,0.06)] text-[var(--color-accent)]"
          : "border-[var(--color-border-soft)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
      )}
    >
      {label}
    </button>
  );
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
    if (session.status === "anonymous") {
      router.push("/login");
      return;
    }
    if (session.status === "authed") load();
  }, [session.status, load, router]);

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
    router.push("/dashboard");
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
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] py-1">
        <div className="flex items-center gap-[0.4rem] text-[0.92rem] font-semibold">
          <span className="text-[var(--color-ink-muted)]">Mokara</span>
          <span className="text-[var(--color-ink-faint)]">›</span>
          <span>{detail.team.name}</span>
          <button
            type="button"
            aria-label="Star"
            className="ml-1 grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink-muted)]"
          >
            <StarIcon />
          </button>
        </div>
        <button
          type="button"
          aria-label="Notifications"
          className="grid size-8 cursor-pointer place-items-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          <BellIcon />
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-[var(--radius-btn)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.08)] px-4 py-[0.7rem] text-[0.88rem] text-[var(--color-danger-ink)]">
          {error.message}
        </div>
      )}

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
          {isWorkspace ? (
            <>
              <div className="rounded-[16px] border border-[rgba(99,102,241,0.25)] bg-[linear-gradient(135deg,rgba(99,102,241,0.09),rgba(14,165,233,0.07))] p-4">
                <h2 className="m-0 text-[0.95rem] font-bold tracking-[-0.01em]">
                  🚀 Make this a team
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
                  {detail.members.length} / 3
                </span>
              </div>
              <div className="flex flex-col">
                {detail.members.map((m) => (
                  <div
                    key={m.user_id}
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
                  </div>
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
