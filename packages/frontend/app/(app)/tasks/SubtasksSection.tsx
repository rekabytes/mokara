"use client";

import { MoveArrowIcon, TrashIcon } from "./icons";
import { useAsyncError } from "@/hooks/useAsyncError";
import { api, type SubtaskItem, type Task } from "@/lib/api";
import { cn } from "@/lib/cn";
import { listItemVariants, tickVariants } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
// The task checklist: `SubtasksSection` (list + add + reorder + delete) and
// `SubtaskTitle` (the inline rename field).
//
// Checklist items are task CONTENT, not authored objects — the table has no
// author column, so any container member may edit any item. The section is
// optimistic and seeded by `key={task.id}` on the caller side: switching tasks
// remounts it, which is what stops one task's draft list leaking into the next.
// Reordering arrows, not drag — and the whole list is PUT as dense 0..n-1.

export function SubtasksSection({ task }: { task: Task }) {
  // Seeded straight from the task payload — the checklist is embedded in every
  // task response — and the drawer mounts this per task with key={task.id}, so
  // no prop→state mirror effect is needed (house rule: seed, don't sync).
  // Steps are a CREATION-TIME feature (owner, 2026-09-05): the New task modal
  // adds them; this section only shows, ticks, renames, reorders and removes
  // what exists — and renders nothing at all when there are none.
  const [items, setItems] = useState<SubtaskItem[]>(task.subtasks);
  const { error, setError, run } = useAsyncError();

  const doneCount = items.filter((i) => i.done).length;

  async function toggle(item: SubtaskItem) {
    const done = !item.done;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done } : i)));
    const res = await run(() => api.updateSubtask(item.id, { done }), {
      fallback: "Failed to update the step",
      onError: () =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !done } : i))),
    });
    if (!res) return;
    setError(null);
    setItems((prev) => prev.map((i) => (i.id === item.id ? res.subtask : i)));
  }

  async function rename(item: SubtaskItem, title: string) {
    const trimmed = title.trim();
    if (!trimmed || trimmed === item.title) return;
    const prevTitle = item.title;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, title: trimmed } : i)));
    const res = await run(() => api.updateSubtask(item.id, { title: trimmed }), {
      fallback: "Failed to rename the step",
      onError: () =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, title: prevTitle } : i))),
    });
    if (!res) return;
    setError(null);
    setItems((prev) => prev.map((i) => (i.id === item.id ? res.subtask : i)));
  }

  async function remove(item: SubtaskItem) {
    const snapshot = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    // DELETE resolves void → undefined, so test for null, not falsiness.
    const ok = await run(() => api.deleteSubtask(item.id), {
      fallback: "Failed to delete the step",
      onError: () => setItems(snapshot),
    });
    if (ok !== null) setError(null);
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const moved = items[index];
    const rest = items.filter((_, i) => i !== index);
    const next = [...rest.slice(0, target), moved, ...rest.slice(target)];
    setItems(next);
    // The whole order goes up every time: a dense 0..n-1 rewrite is cheaper to
    // reason about than patching two positions and hoping they land in order.
    const ok = await run(
      () =>
        api.orderSubtasks(
          task.id,
          next.map((i) => i.id)
        ),
      {
        fallback: "Failed to reorder the steps",
        // The array order is what we drew, so roll the whole list back.
        onError: () => setItems(items),
      }
    );
    if (ok !== null) setError(null);
  }

  // A task created without steps shows no checklist at all (owner: "if it
  // wasn't added, don't show"). Deleting the last step hides it again.
  if (items.length === 0) return null;

  return (
    <section className="mt-5 shrink-0" aria-label="Checklist">
      <div className="flex items-center gap-2">
        <h3 className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Checklist
        </h3>
        <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-px text-[0.68rem] font-medium text-[var(--color-ink-faint)]">
          {doneCount}/{items.length}
        </span>
      </div>

      <div className="mt-1.5 max-h-[9rem] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              variants={listItemVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              layout="position"
              className="group flex items-center gap-2 py-[0.22rem]"
            >
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-pressed={item.done}
                aria-label={item.done ? "Mark as not done" : "Mark as done"}
                className={cn(
                  "grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors duration-150",
                  item.done
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-border-strong)] bg-[var(--color-surface-solid)] text-transparent hover:border-[var(--color-accent)]"
                )}
              >
                <AnimatePresence>
                  {item.done && (
                    <motion.svg
                      key="tick"
                      variants={tickVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      width="12"
                      height="12"
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
                      />
                    </motion.svg>
                  )}
                </AnimatePresence>
              </button>

              {/* Title: contentEditable-free inline edit — a double-click
                    swaps in an input seeded with the current text, same
                    contract as the drawer's title/description fields. */}
              <SubtaskTitle value={item.title} onCommit={(next) => rename(item, next)} />

              <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                    className="grid size-5 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white hover:text-[var(--color-ink)]"
                  >
                    <MoveArrowIcon />
                  </button>
                )}
                {index < items.length - 1 && (
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                    className="grid size-5 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white hover:text-[var(--color-ink)]"
                  >
                    <MoveArrowIcon down />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(item)}
                  aria-label="Delete step"
                  className="grid size-5 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-white hover:text-[var(--color-danger)]"
                >
                  <TrashIcon />
                </button>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {error && <p className="mt-1 text-[0.72rem] text-[var(--color-danger)]">{error.message}</p>}
    </section>
  );
}

// One checklist row's text. Double-click to edit, Enter/blur commits, Esc
// cancels — the same contract the drawer's title uses, at row size.
export function SubtaskTitle({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Double-click to rename"
        className={cn(
          "min-w-0 flex-1 cursor-text truncate rounded px-1 text-[0.85rem] transition-colors duration-150 hover:bg-[var(--color-surface-2)]",
          value.trim() === "" ? "text-[var(--color-ink-faint)] italic" : "text-[var(--color-ink)]"
        )}
      >
        {value}
      </span>
    );
  }

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          onCommit(draft);
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      maxLength={200}
      aria-label="Step name"
      className="field min-w-0 flex-1 rounded px-1.5 py-0.5 text-[0.85rem]"
    />
  );
}
