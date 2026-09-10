"use client";

import { LayerRow } from "./LayerRow";
import { LockIcon } from "./team-icons";
import {
  type ContainerScope,
  type Kpi,
  type KpiProgress,
  type Project,
  type Team,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { collapseVariants } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useState } from "react";
// The container's layers rail (PRD-06): the team layer of owner-created, shared
// projects and KPIs, then each member's personal layer grouped by owner, plus
// the create form, the `SWATCHES` colour picker, the `GroupLabel` divider and
// the `ScopeToggle` that decides whether a new project is personal or shared.
//
// No linking between layers and no parent/child graph — comparing is manual, by
// design. Archived projects stay reachable through the "Archived" toggle so
// nothing silently disappears. Creating a SHARED project is leader-gated; a KPI
// is always personal. All mutations are `onAdd`/`onRename`/`onArchive`/
// `onDelete` props owned by the page, which is what keeps this rail free of
// data fetching.

export const SWATCHES = [
  "#6366f1",
  "#0ea5e9",
  "#15803d",
  "#ef4444",
  "#a16207",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
];

export function LayersPanel({
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
          {/* The archived block used to appear and disappear between two
              renders. `height: "auto"` is measured by framer-motion, so the
              section opens without a scrollHeight in an effect. */}
          <AnimatePresence initial={false}>
            {showArchived && (
              <motion.ul
                key="archived-projects"
                variants={collapseVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
                className="m-0 mb-3 flex max-h-[300px] list-none flex-col gap-1.5 overflow-hidden overflow-y-auto p-0"
              >
                {pgArchived.map((p) => (
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
              </motion.ul>
            )}
          </AnimatePresence>
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
        <p className="col-span-full m-0 -mt-2 flex items-start gap-1.5 text-[0.76rem] text-[var(--color-ink-faint)] max-[900px]:col-span-1">
          <span className="mt-[2px] shrink-0">
            <LockIcon />
          </span>
          <span>
            Team projects &amp; KPIs unlock when this workspace becomes a team — invite someone and
            they take effect the moment they accept.
          </span>
        </p>
      )}
    </div>
  );
}

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-0.5 pb-0.5 pt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-[var(--color-ink-faint)]">
      {children}
    </li>
  );
}

export function ScopeToggle({
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
