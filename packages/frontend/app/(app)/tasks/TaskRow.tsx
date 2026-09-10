"use client";

import { PriorityBars, SmallIconButton } from "./chrome";
import { FlagIcon, KpiIcon, StatusGlyph, TrashIcon } from "./icons";
import { formatDate, shortId } from "./task-format";
import { type Project, type Task } from "@/lib/api";
import { cn } from "@/lib/cn";
import { listItemVariants } from "@/lib/motion";
import { motion } from "framer-motion";
// One row of the board list: priority bars, title, chips, due date, flag and
// the row actions.
//
// Motion rules that live here: the row animates `layout="position"` ONLY (the
// house rule for lists — no size projection inside the clipped scroller), and
// it inherits `listItemVariants` from the parent `<AnimatePresence>`, so it must
// not carry its own `initial`/`animate` labels.

export function TaskRow({
  task,
  done,
  project,
  onOpen,
  onToggle,
  onCyclePriority,
  onToggleFlag,
  onDelete,
}: {
  task: Task;
  done: boolean;
  project: Project | null;
  onOpen: () => void;
  onToggle: () => void;
  onCyclePriority: () => void;
  onToggleFlag: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.li
      onClick={onOpen}
      // `position`, not `layout`: rows glide to their new slot when the sort
      // or filter changes (today they teleport) without projecting a size,
      // which is what goes wrong inside an overflow-clipped scroll area.
      layout="position"
      variants={listItemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={cn(
        "group mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors duration-[120ms] hover:bg-[var(--color-surface-2)]"
      )}
    >
      {/* Checkbox — own click handler, stopPropagation so it doesn't open the drawer */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        aria-pressed={done}
        className={cn(
          "grid size-[15px] shrink-0 cursor-pointer place-items-center rounded-[3px] border-[1.5px] border-[var(--color-border-strong)] bg-transparent text-transparent transition-[background,border-color,transform,color] duration-[140ms] hover:border-[var(--color-accent)]",
          done && "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
        )}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="currentColor"
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Priority — own click handler, stopPropagation */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCyclePriority();
        }}
        aria-label={`Priority: ${task.priority}. Click to cycle.`}
        title={`Priority: ${task.priority} — click to cycle`}
        className="cursor-pointer rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-[rgba(99,102,241,0.06)]"
      >
        <PriorityBars priority={task.priority} />
      </button>

      <span className="w-[58px] shrink-0 select-none font-mono text-[0.74rem] tracking-[0.02em] text-[var(--color-ink-faint)]">
        {shortId(task)}
      </span>

      <StatusGlyph status={task.status} />

      {/* Title is now a static span — clicking the row opens the drawer */}
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            "block w-full truncate text-[0.92rem] font-medium tracking-[-0.005em] transition-colors duration-[140ms]",
            done ? "text-[var(--color-ink-faint)] line-through" : "text-[var(--color-ink)]"
          )}
        >
          {task.title}
        </span>
      </div>

      {(task.project_id || task.kpis.length > 0) && (
        <span className="flex shrink-0 max-w-[320px] items-center gap-2 text-[0.72rem] text-[var(--color-ink-faint)] max-[900px]:hidden">
          {project && (
            <span
              className="inline-flex min-w-0 items-center gap-1"
              title={`Project: ${project.name}`}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: project.color ?? "var(--color-ink-faint)" }}
              />
              <span className="truncate">{project.name}</span>
            </span>
          )}
          {task.kpis.map((k) => (
            <span
              key={k.kpi_id}
              className="inline-flex min-w-0 items-center gap-1"
              title={`${k.name}: ${k.weight}%`}
            >
              <KpiIcon />
              <span className="truncate">
                {k.name} {k.weight}%
              </span>
            </span>
          ))}
        </span>
      )}

      {task.assignee && (
        <span
          title={`Assigned to ${task.assignee.display_name || task.assignee.username}`}
          className="grid size-5 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-[0.6rem] font-bold text-white"
        >
          {(task.assignee.display_name || task.assignee.username).slice(0, 1).toUpperCase()}
        </span>
      )}

      {task.due_date && (
        <span className="shrink-0 font-mono text-[0.74rem] text-[var(--color-ink-faint)]">
          {formatDate(task.due_date)}
        </span>
      )}

      {/* Flag: always visible when active (so the red badge persists),
          otherwise hidden until row hover. The wrapper stops click
          propagation so toggling the flag doesn't open the drawer. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "shrink-0",
          task.flagged ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <SmallIconButton
          label={task.flagged ? "Unflag" : "Flag for attention"}
          onClick={onToggleFlag}
          active={task.flagged}
        >
          <FlagIcon filled={task.flagged} />
        </SmallIconButton>
      </div>

      {/* Trash: always row-hover/focus-only. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex shrink-0 items-center gap-[1px] opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100"
      >
        <SmallIconButton label="Delete" onClick={onDelete} danger>
          <TrashIcon />
        </SmallIconButton>
      </div>
    </motion.li>
  );
}
