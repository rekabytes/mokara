"use client";

import { AttachmentsSection } from "./AttachmentsSection";
import { PRIORITY_IDS, STATUS_IDS, STATUS_LABEL, containerMembersAtom } from "./board-model";
import { AssigneeChip, KpiChip, ProjectChip } from "./chips";
import { ChipShell, Dropdown, MenuItem, PriorityBars } from "./chrome";
import { CommentsSection } from "./CommentsSection";
import { DatePicker } from "./DatePicker";
import {
  CalendarIcon,
  ChevronIcon,
  CloseSmallIcon,
  DotsIcon,
  FlagIcon,
  StatusGlyph,
  TrashIcon,
} from "./icons";
import { SubtasksSection } from "./SubtasksSection";
import { shortId } from "./task-format";
import {
  type BindingDraft,
  type Kpi,
  type Project,
  type Task,
  type TaskPatch,
  type User,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useAtom } from "jotai";
// The task detail drawer: `TaskDetailDrawer` (header, chips, description,
// checklist, files, comment thread) and `DescriptionField` (the inline
// save-on-blur textarea).
//
// Rules that live here: the drawer animates `width: "40%"` against the
// `@container` row that STAYS in `page.tsx`, and its inner card is sized
// `w-[min(40cqw,640px)]` against that same row — so the row must not move or
// both numbers resolve against a different element.
// Read-only by design where the modal is the builder: steps and files are
// creation-time affordances in the UI (the API still accepts later uploads),
// and sections hide when empty. Clearing a due date sends `null`, never
// `undefined` — JSON.stringify drops the latter.

export function TaskDetailDrawer({
  task,
  currentUser,
  projects,
  kpis,
  onClose,
  onUpdate,
  onSetKpis,
  onToggleFlag,
  onDelete,
}: {
  task: Task;
  currentUser: User | null;
  projects: Project[];
  kpis: Kpi[];
  onClose: () => void;
  onUpdate: (patch: TaskPatch) => void;
  onSetKpis: (bindings: BindingDraft[]) => void;
  onToggleFlag: () => void;
  onDelete: () => void;
}) {
  // ---- Title rename (double-click in drawer) ----
  // `titleEditing` is the only state here; the read-only branch renders
  // `task.title` and `startRename()` seeds the draft on the way in. The mirror
  // effect that used to copy `task.title` into `titleDraft` therefore only ever
  // ran while the draft was invisible — it was a useState->useState chain, not
  // a sync with anything outside React.
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ---- PRD-10/11: container members, read from the shared atom — the page
  // effect keeps the current container's list warm; the drawer manages no
  // member state of its own.
  const [members] = useAtom(containerMembersAtom);

  // ---- Due date: read straight off the task, persisted via PATCH on every
  //      change. DatePicker is fully controlled by `task.due_date`, so a
  //      server-side change lands on the chip with no mirroring (and no local
  //      copy to fall out of step). There is no start date: work starts when
  //      the status moves to in_progress. ----

  // ---- Global ESC closes the drawer, but only when no input/textarea is
  //      focused — inputs handle their own ESC semantics locally. A document
  //      keydown listener is outside React, so this effect stays. ----
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          // instanceof, not `as HTMLElement`: activeElement can be a node where
          // the cast would simply lie about isContentEditable existing.
          (active instanceof HTMLElement && active.isContentEditable))
      ) {
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function startRename() {
    setTitleDraft(task.title);
    setTitleEditing(true);
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }

  function commitRename() {
    setTitleEditing(false);
    const t = titleDraft.trim();
    if (!t || t === task.title) {
      setTitleDraft(task.title);
      return;
    }
    onUpdate({ title: t });
  }

  function cancelRename() {
    setTitleDraft(task.title);
    setTitleEditing(false);
  }

  function onTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  return (
    <aside
      role="complementary"
      aria-label="Task detail"
      // Fixed width in container units (resolves against the row, not the
      // animating wrapper) + ml-auto pins the card to the wrapper's right
      // edge, so as the wrapper's width animates 0 → full the card slides
      // in from the right instead of squishing. Body is flex-1 +
      // overflow-hidden + line-clamped title/description — the drawer
      // never scrolls, regardless of task count. Visual card look (bg,
      // border, radius, shadow) comes from the wrapper.
      className="ml-auto flex h-full w-[min(40cqw,640px)] shrink-0 flex-col overflow-hidden"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-4 py-2.5">
        <div className="flex items-center gap-2 text-[0.85rem]">
          <span className="block size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_var(--color-accent-soft)]" />
          <span className="text-[var(--color-ink-muted)]">Task</span>
          <span className="font-mono text-[0.76rem] tracking-[0.02em] text-[var(--color-ink-faint)]">
            {shortId(task)}
          </span>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
        >
          <CloseSmallIcon />
        </button>
      </div>

      {/* Body — flex column: fixed title/description/chips/checklist up top,
          comments take the remaining height (shrink-0 on the checklist keeps
          that true however many steps exist). Title/description stay
          line-clamped. */}
      <div className="flex flex-1 flex-col overflow-hidden px-5 py-4">
        {/* Title — double-click to rename inline */}
        {titleEditing ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={onTitleKey}
            className="block w-full rounded-md border border-[var(--color-border-soft)] bg-white px-2 py-1.5 text-[1.3rem] font-semibold tracking-[-0.012em] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
        ) : (
          <h2
            data-tour="drawer-title"
            onDoubleClick={startRename}
            title="Double-click to rename"
            className={cn(
              "cursor-text rounded-md px-1 py-0.5 -mx-1 text-[1.3rem] font-semibold tracking-[-0.012em] transition-colors duration-150 hover:bg-[var(--color-surface-2)] line-clamp-2",
              task.status === "done"
                ? "text-[var(--color-ink-faint)] line-through"
                : "text-[var(--color-ink)]"
            )}
          >
            {task.title}
          </h2>
        )}
        {task.creator && (
          <p className="m-0 mt-0.5 px-1 text-[0.72rem] text-[var(--color-ink-faint)]">
            Created by {task.creator.display_name || task.creator.username}
            {task.creator.id === currentUser?.id ? " (you)" : ""}
          </p>
        )}

        {/* Description — click to edit. Both render branches carry the same
            tour target (PRD-13): only one is ever on screen, and the edit box
            must be frameable too. */}
        <DescriptionField
          value={task.description ?? ""}
          onSave={(text) => {
            const trimmed = text.trim();
            if (trimmed === (task.description ?? "")) return;
            onUpdate({ description: trimmed || null });
          }}
        />

        {/* Files — PRD-11, creation-time only. Part of the description area;
            renders nothing when the task has none. */}
        <AttachmentsSection key={`files-${task.id}`} taskId={task.id} currentUser={currentUser} />

        {/* Chip row — ONE line (owner): status / priority / due date / assignee
            stay inline; project, KPIs and flag fold into the "…" panel, which
            keeps them fully editable (each chip still opens its own menu). */}
        <div className="mt-5 flex items-center gap-1.5" data-tour="drawer-chips">
          <Dropdown
            trigger={(open) => (
              <ChipShell open={open}>
                <StatusGlyph status={task.status} />
                <span>{STATUS_LABEL[task.status]}</span>
                <ChevronIcon />
              </ChipShell>
            )}
          >
            {STATUS_IDS.map((s) => (
              <MenuItem
                key={s}
                selected={s === task.status}
                icon={<StatusGlyph status={s} />}
                onClick={() => onUpdate({ status: s })}
              >
                {STATUS_LABEL[s]}
              </MenuItem>
            ))}
          </Dropdown>

          <Dropdown
            trigger={(open) => (
              <ChipShell open={open}>
                <PriorityBars priority={task.priority} />
                <span className="capitalize">{task.priority}</span>
                <ChevronIcon />
              </ChipShell>
            )}
          >
            {PRIORITY_IDS.map((p) => (
              <MenuItem
                key={p}
                selected={p === task.priority}
                icon={<PriorityBars priority={p} />}
                onClick={() => onUpdate({ priority: p })}
              >
                <span className="capitalize">{p}</span>
              </MenuItem>
            ))}
          </Dropdown>

          <DatePicker
            value={task.due_date ?? null}
            onChange={(iso) =>
              // null clears the due date (undefined would be dropped by
              // JSON.stringify and leave the old value in place).
              onUpdate({ due_date: iso })
            }
            trigger={(open, summary) => (
              <ChipShell open={open}>
                <CalendarIcon />
                <span>{summary}</span>
                <ChevronIcon />
              </ChipShell>
            )}
          />

          <AssigneeChip
            members={members}
            creator={task.creator}
            value={task.assignee}
            currentUserId={currentUser?.id ?? null}
            onChange={(assigneeId) => onUpdate({ assignee_id: assigneeId })}
          />

          {/* The "…" — everything below the owner's priority line lives here,
              still editable. The span only carries the tour target (PRD-13):
              ChipShell forwards no extra props. */}
          <Dropdown
            trigger={(open) => (
              <span data-tour="drawer-more" className="inline-flex">
                <ChipShell open={open}>
                  <DotsIcon />
                  <ChevronIcon />
                </ChipShell>
              </span>
            )}
          >
            <div className="flex flex-col items-start gap-1 p-1.5">
              <ProjectChip
                projects={projects}
                value={task.project_id}
                onChange={(id) => onUpdate({ project_id: id })}
              />
              <KpiChip
                // Only the actor's own KPIs are offered; bindings teammates
                // made are frozen from here (the server preserves them).
                kpis={kpis.filter((k) => k.owner_id === currentUser?.id)}
                value={task.kpis.filter((b) =>
                  kpis.some((k) => k.owner_id === currentUser?.id && k.id === b.kpi_id)
                )}
                onChange={(next) =>
                  onSetKpis(next.map((b) => ({ kpi_id: b.kpi_id, weight: b.weight })))
                }
              />
              {/* Flag chip — uses onToggleFlag (POST /tasks/:id/flag), since
                  PATCH /tasks/:id is .strict() and rejects `flagged`. */}
              <button
                type="button"
                onClick={onToggleFlag}
                aria-pressed={task.flagged}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.78rem] font-medium transition-colors duration-150",
                  task.flagged
                    ? "border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
                    : "border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                )}
              >
                <FlagIcon filled={task.flagged} />
                <span>{task.flagged ? "Flagged" : "Flag"}</span>
              </button>
            </div>
          </Dropdown>
        </div>

        {/* Checklist — PRD-11 Phase 1.2: creation-time only, so this is a
            viewer for steps that exist. `key` remounts it per task so the
            seeded list can never bleed from one task to the next. */}
        <SubtasksSection key={task.id} task={task} />

        {/* Comments — fills remaining drawer height (PRD-03 Phase 1) */}
        <CommentsSection taskId={task.id} currentUser={currentUser} />
      </div>

      {/* Footer — the walkthrough frames this on a LOOK step on purpose: the
          Delete button has no confirmation, so it must stay out of reach. */}
      <div
        className="flex items-center justify-between border-t border-[var(--color-border-soft)] px-5 py-3"
        data-tour="drawer-footer"
      >
        <span className="text-[0.74rem] text-[var(--color-ink-faint)]">
          Press{" "}
          <kbd className="rounded border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-1 font-mono text-[0.7rem]">
            Esc
          </kbd>{" "}
          to close
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-[0.78rem] font-medium text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
        >
          <TrashIcon />
          Delete
        </button>
      </div>
    </aside>
  );
}

export function DescriptionField({
  value,
  onSave,
}: {
  value: string;
  onSave: (text: string) => void;
}) {
  // Read-only branch shows `value`, `startEdit()` seeds the draft — so nothing
  // has to copy `value` into `draft` behind the scenes.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
    else setDraft(value);
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        data-tour="drawer-description"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value);
            setEditing(false);
          }
          // Owner (2026-09-10): Enter saves, Shift+Enter is a newline — the
          // chat-input grammar, since ⌘+Enter was undiscoverable. ⌘/Ctrl+Enter
          // still saves (same action, and it matches the composer's hint).
          else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
        rows={3}
        placeholder="Add description…"
        className="mt-3 w-full resize-none rounded-md border border-[var(--color-border-soft)] bg-white px-2.5 py-2 text-[0.92rem] leading-[1.5] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />
    );
  }

  return (
    <div
      onClick={startEdit}
      data-tour="drawer-description"
      // line-clamp-3 keeps a long description from pushing the compact
      // drawer taller than its content-allocated height (no internal scroll).
      // whitespace-pre-wrap keeps the newlines typed in the textarea — HTML
      // collapses them to spaces otherwise, so a 3-line note rendered as one.
      className={cn(
        "mt-3 min-h-[2.25rem] cursor-text rounded-md px-2.5 py-1.5 -mx-2 whitespace-pre-wrap break-words text-[0.92rem] leading-[1.5] transition-colors duration-150 hover:bg-[var(--color-surface-2)] line-clamp-3",
        value ? "text-[var(--color-ink)]" : "text-[var(--color-ink-faint)]"
      )}
    >
      {value || "Add description…"}
    </div>
  );
}
