"use client";

import { ArchiveIcon, PencilIcon, TrashIcon, UnarchiveIcon } from "./team-icons";
import { cn } from "@/lib/cn";
import { DUR, snap } from "@/lib/motion";
import { motion } from "framer-motion";
import { useState } from "react";
// One project/KPI row inside `LayersPanel`: the colour dot or KPI badge, the
// inline rename field, the archived state, and the rename / archive / delete
// affordances.
//
// Every action is a `(…) => Promise<boolean>` prop: the row optimistically shows
// the edit, then reverts when the promise resolves false, so the caller owns the
// API call and the row owns no data fetching. `canManage` gates whether the
// affordances render at all (creator-or-leader), and `onArchive` is OPTIONAL —
// a KPI has no archived state, so it is simply not passed.

// One layer row with hover actions: rename (inline), archive/unarchive
// (projects only), delete. Actions appear on hover for members, always for
// rows the viewer manages.
export function LayerRow({
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
    <motion.li
      // `position`, not `layout`: renaming, archiving or deleting a layer
      // re-sorts these rows, and they now slide to their new slot instead of
      // jumping. Position-only means the row's width never gets projected
      // through the list's overflow clip. No enter/exit here on purpose —
      // these lists render on page load, and a fade-in for every layer would
      // read as a screensaver, not as feedback.
      layout="position"
      transition={snap(DUR.base)}
      className={cn(
        "group flex items-center gap-2 rounded-[9px] border border-[var(--color-border-soft)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[0.84rem] transition-opacity duration-[140ms]",
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
                    // Same width transition the analytics scorecard uses, so a
                    // KPI/project bar animates identically on both pages.
                    "block h-full rounded-[999px] transition-[width] duration-300 ease-out",
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
    </motion.li>
  );
}
