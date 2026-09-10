"use client";

import { PRIORITY_IDS, STATUS_IDS, STATUS_LABEL, containerMembersAtom } from "./board-model";
import { AssigneeChip, KpiChip, ProjectChip } from "./chips";
import { ChipShell, Dropdown, MenuItem, MinWidthChip, PriorityBars } from "./chrome";
import { DatePicker } from "./DatePicker";
import {
  CalendarIcon,
  ChevronIcon,
  CloseSmallIcon,
  DotsIcon,
  ExpandIcon,
  PaperclipIcon,
  PlusSmallIcon,
  StatusDot,
} from "./icons";
import {
  type BindingDraft,
  type Kpi,
  type Project,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/api";
import { backdropVariants, sheetVariants } from "@/lib/motion";
import { motion } from "framer-motion";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useAtom } from "jotai";
// The create-task modal: title (the only required field), the chip row, the
// steps builder, the file picker, and submit.
//
// Rules that live here: the submit handler calls `e.preventDefault()` as its
// FIRST statement, then creates the task and only then uploads attachments —
// without it the browser navigates after the first `await` and the task lands on
// the board while its files never upload (the 2026-09-05 bug). The draft is
// seeded in the open handler / `useState` initialisers and reset by `key`,
// never mirrored in an effect. The root card carries NO `initial`/`animate` of
// its own: it inherits the page scrim's variant labels. Steps and files are
// creation-time only — the drawer shows them read-only.

export function NewTaskModal({
  title,
  setTitle,
  description,
  setDescription,
  priority,
  setPriority,
  status,
  setStatus,
  dueDate,
  setDueDate,
  projects,
  kpis,
  projectId,
  setProjectId,
  kpiBindings,
  setKpiBindings,
  assigneeId,
  setAssigneeId,
  currentUserId,
  subtasks,
  setSubtasks,
  files,
  setFiles,
  creating,
  onSubmit,
  onClose,
  onKeyDown,
}: {
  title: string;
  setTitle: (s: string) => void;
  description: string;
  setDescription: (s: string) => void;
  priority: TaskPriority;
  setPriority: (p: TaskPriority) => void;
  status: TaskStatus;
  setStatus: (s: TaskStatus) => void;
  dueDate: string | null;
  setDueDate: (iso: string | null) => void;
  projects: Project[];
  kpis: Kpi[];
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  kpiBindings: BindingDraft[];
  setKpiBindings: (b: BindingDraft[]) => void;
  // PRD-10: assignee at creation, offered from the shared members atom.
  assigneeId: string | null;
  setAssigneeId: (id: string | null) => void;
  currentUserId: string | null;
  // PRD-11: steps and files exist only at creation — drafted here, uploaded
  // after the task exists.
  subtasks: string[];
  setSubtasks: (steps: string[]) => void;
  files: File[];
  setFiles: (f: File[]) => void;
  creating: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  // Local draft for the step input; the committed list is the parent's state.
  const [stepDraft, setStepDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // PRD-10: assignee at creation. Members come from the shared container atom
  // (page-level fetch) — the modal runs no fetch of its own.
  const [members] = useAtom(containerMembersAtom);
  const assigneeMember = members.find((m) => m.user_id === assigneeId) ?? null;

  function commitStep() {
    const step = stepDraft.trim();
    if (!step) return;
    setSubtasks([...subtasks, step]);
    setStepDraft("");
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-title"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 grid place-items-center px-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default border-0 bg-[rgba(15,23,42,0.75)] backdrop-blur-[2px]"
      />
      {/* No initial/animate: it inherits the scrim's variant labels, so the
          card lifts into place while the backdrop fades — and both reverse on
          close from one presence check. */}
      <motion.div
        variants={sheetVariants}
        className="relative z-10 w-full max-w-[640px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-white shadow-[var(--shadow-card)]"
      >
        {/* Top bar: breadcrumb + actions */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-soft)] px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-[0.85rem] font-semibold">
            <span className="block size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_var(--color-accent-soft)]" />
            <span className="text-[var(--color-ink-muted)]">Mokara</span>
            <span className="text-[var(--color-ink-faint)]">›</span>
            <span id="new-task-title">New task</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Expand"
              className="grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              <ExpandIcon />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-6 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              <CloseSmallIcon />
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit}>
          {/* Body: title + description */}
          {/* PRD-13: one target for both fields — the walkthrough frames them
              together and leaves them typable (act step). */}
          <div className="px-4 pt-3 pb-2" data-tour="task-fields">
            <input
              type="text"
              required
              // Declarative focus: the modal now mounts inside AnimatePresence,
              // so autoFocus replaces the rAF(focus()) that openModal used to
              // need to wait for a render that no longer exists.
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border-0 bg-transparent text-[1.05rem] font-medium text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:bg-transparent focus:shadow-none"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description…"
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border-0 bg-transparent text-[0.9rem] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)]"
            />
          </div>

          {/* Chip row: status, priority, due date, more */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3" data-tour="task-chips">
            <Dropdown
              trigger={(open) => (
                <ChipShell open={open}>
                  <MinWidthChip
                    icon={<StatusDot status="in_progress" />}
                    longestLabel={STATUS_LABEL.in_progress}
                  >
                    <StatusDot status={status} />
                    <span>{STATUS_LABEL[status]}</span>
                  </MinWidthChip>
                  <ChevronIcon />
                </ChipShell>
              )}
            >
              {STATUS_IDS.map((s) => (
                <MenuItem
                  key={s}
                  selected={s === status}
                  icon={<StatusDot status={s} />}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABEL[s]}
                </MenuItem>
              ))}
            </Dropdown>
            <Dropdown
              trigger={(open) => (
                <ChipShell open={open}>
                  <MinWidthChip icon={<PriorityBars priority="medium" />} longestLabel="Medium">
                    <PriorityBars priority={priority} />
                    <span className="capitalize">{priority}</span>
                  </MinWidthChip>
                  <ChevronIcon />
                </ChipShell>
              )}
            >
              {PRIORITY_IDS.map((p) => (
                <MenuItem
                  key={p}
                  selected={p === priority}
                  icon={<PriorityBars priority={p} />}
                  onClick={() => setPriority(p)}
                >
                  <span className="capitalize">{p}</span>
                </MenuItem>
              ))}
            </Dropdown>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              trigger={(open, summary) => (
                <ChipShell open={open}>
                  <CalendarIcon />
                  <span className={dueDate ? "text-[var(--color-ink)]" : ""}>{summary}</span>
                </ChipShell>
              )}
            />
            {/* PRD-10: assignee at creation — the same inline chip as the
                drawer. Members come from the shared Jotai atom (page-level
                fetch); the modal never fetches. */}
            <AssigneeChip
              members={members}
              creator={null}
              value={
                assigneeMember
                  ? {
                      id: assigneeMember.user_id,
                      username: assigneeMember.username,
                      display_name: assigneeMember.display_name,
                    }
                  : null
              }
              currentUserId={currentUserId}
              onChange={setAssigneeId}
            />

            {/* The "…" — project and KPIs fold in here, identical to the
                drawer's panel; each chip still opens its own menu inside. The
                span only carries the tour target (PRD-13): ChipShell forwards
                no extra props, and this is the element the walkthrough frames. */}
            <Dropdown
              trigger={(open) => (
                <span data-tour="task-more" className="inline-flex">
                  <ChipShell open={open}>
                    <DotsIcon />
                    <ChevronIcon />
                  </ChipShell>
                </span>
              )}
            >
              <div className="flex flex-col items-start gap-1 p-1.5">
                <ProjectChip projects={projects} value={projectId} onChange={setProjectId} />
                {/* kpis arrive pre-filtered to the actor's own — binding is
                    personal. */}
                <KpiChip kpis={kpis} value={kpiBindings} onChange={setKpiBindings} />
              </div>
            </Dropdown>
          </div>

          {/* Steps — creation-time checklist (PRD-11). Drafted here; uploaded
              right after the task exists. The wrapper is a walkthrough target
              (PRD-13): new steps can only be added here. */}
          <div className="px-4 pb-3" data-tour="task-steps">
            <p className="m-0 mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
              Steps
            </p>
            {subtasks.length > 0 && (
              <div className="mb-1.5 flex flex-col gap-1">
                {subtasks.map((step, i) => (
                  <span
                    key={`${step}-${i}`}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--color-surface)] px-2 py-1 text-[0.8rem] text-[var(--color-ink)]"
                  >
                    <span className="font-mono text-[0.7rem] text-[var(--color-ink-faint)]">
                      {i + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate">{step}</span>
                    <button
                      type="button"
                      aria-label={`Remove step ${i + 1}`}
                      onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))}
                      className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
                    >
                      <CloseSmallIcon />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={stepDraft}
                onChange={(e) => setStepDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitStep();
                  }
                }}
                placeholder="Add a step…"
                maxLength={200}
                aria-label="New step"
                className="field min-w-0 flex-1 px-2 py-1 text-[0.82rem]"
              />
              <button
                type="button"
                onClick={commitStep}
                disabled={!stepDraft.trim()}
                aria-label="Add step"
                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-[var(--color-ink-muted)] transition-colors duration-150 hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] disabled:cursor-default disabled:opacity-40"
              >
                <PlusSmallIcon />
              </button>
            </div>
          </div>

          {/* Attached files — removable until Create; image and PDF only. */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {files.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="flex max-w-full items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.15rem] text-[0.72rem] text-[var(--color-ink-muted)]"
                >
                  <PaperclipIcon />
                  <span className="min-w-0 truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="grid size-3.5 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
                  >
                    <CloseSmallIcon />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Footer: attachment + Cancel + Create */}
          <div className="flex items-center justify-between border-t border-[var(--color-border-soft)] px-4 py-2.5">
            <div className="flex items-center gap-1.5" data-tour="task-attach">
              {/* PRD-11: files exist only at creation — image and PDF only,
                  enforced by the route. The paperclip here was a dead button
                  before; it opens the picker now. */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach an image or PDF"
                className="grid size-7 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
              >
                <PaperclipIcon />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files;
                  if (picked && picked.length > 0) {
                    setFiles([...files, ...Array.from(picked)]);
                  }
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
                  {files.length} file{files.length === 1 ? "" : "s"} attached
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-base btn-ghost"
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                data-tour="task-submit"
                className="btn-base btn-primary"
                style={{ padding: "0.45rem 0.95rem", fontSize: "0.82rem" }}
                disabled={!title.trim() || creating}
              >
                {creating ? "Creating…" : "Create task"}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
