"use client";

// The board itself, split in two: `BoardToolbar` (the filter pills, the dead
// filter-settings gear, the sort dropdown and the dead funnel/layout buttons)
// and `TaskBoard` (the card, its scroll surface, the two empty states and the
// collapsible status groups).
//
// Both are presentational — every value and handler arrives as a prop with the
// SAME NAME it had when this JSX lived inside `TasksPage`, so the markup moved
// byte-for-byte and no reference inside it was rewritten.
//
// Contracts that live here and must not be broken:
//   - `data-tour="board-controls"` frames ONLY the four filter pills, because
//     the same row also holds the dead gear/funnel/layout controls; pointing the
//     coach mark at the whole row would advertise buttons that do nothing.
//   - `data-tour="create-task"` sits on THREE mutually exclusive nodes: the
//     empty-board CTA, the filtered-empty CTA and the To-do group header "+".
//     Exactly one is ever on screen (a fresh account renders no group headers at
//     all, and an all-done board under the default `active` filter renders no
//     To-do "+"), which is why one id can serve all three.
//   - the four pills share ONE `layoutId="active-filter-plate"` so the white
//     plate travels between them instead of repainting.
//   - the To-do group renders even when empty: its header carries the only "+"
//     that opens New task, so hiding it would remove the ability to create.
//   - the `@container` row and the drawer stay in `page.tsx`: the drawer is
//     sized in `cqw` against that row, so it must remain a sibling of the card.

import { AnimatePresence, motion } from "framer-motion";
import { FILTERS, SORTS } from "./board-model";
import { IconButton } from "./chrome";
import { FilterIcon, LayoutIcon, PlusSmallIcon, SettingsIcon } from "./icons";
import { TaskRow } from "./TaskRow";
import type { Project, Task } from "@/lib/api";
import type { GroupId, TaskFilter, TaskSort } from "@/lib/tasksView";
import { DUR, snap, collapseVariants } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function BoardToolbar({
  filter,
  setFilter,
  sort,
  setSort,
}: {
  filter: TaskFilter;
  setFilter: (next: TaskFilter) => void;
  sort: TaskSort;
  setSort: (next: TaskSort) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-2">
        <div
          data-tour="board-controls"
          className="inline-flex items-center gap-[2px] rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-[3px] shadow-[var(--shadow-xs)] backdrop-blur-[22px]"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "relative cursor-pointer rounded-full px-3 py-[0.3rem] text-[0.82rem] font-medium transition-colors duration-[140ms]",
                filter === f.id
                  ? "text-[var(--color-ink)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              )}
            >
              {/* One shared layoutId across the four pills: the white plate
                  travels to whichever filter is active instead of being
                  re-painted from scratch on the new one. */}
              {filter === f.id && (
                <motion.span
                  layoutId="active-filter-plate"
                  className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.1)]"
                  transition={snap(DUR.base)}
                />
              )}
              <span className="relative">{f.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Filter settings"
          className="grid size-7 cursor-pointer place-items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] text-[var(--color-ink-faint)] backdrop-blur-[22px] hover:text-[var(--color-ink)]"
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <IconButton label="Filter">
          <FilterIcon />
        </IconButton>
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => {
              // Guarded lookup instead of `e.target.value as Sort`: an
              // unexpected value can't smuggle itself into the atom.
              const next = SORTS.find((s) => s.id === e.target.value)?.id;
              if (next) setSort(next);
            }}
            aria-label="Sort"
            className="cursor-pointer appearance-none rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] py-[0.3rem] pl-3 pr-7 text-[0.82rem] font-medium text-[var(--color-ink-muted)] backdrop-blur-[22px] outline-none hover:text-[var(--color-ink)]"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)]"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </div>
        <IconButton label="Layout">
          <LayoutIcon />
        </IconButton>
      </div>
    </div>
  );
}

export function TaskBoard({
  totalTasks,
  totalVisible,
  filter,
  visibleGroups,
  visibleByGroup,
  collapsed,
  toggleGroup,
  projects,
  openModal,
  openTask,
  toggleTask,
  cyclePriority,
  toggleFlag,
  removeTask,
}: {
  totalTasks: number;
  totalVisible: number;
  filter: TaskFilter;
  visibleGroups: { id: GroupId; name: string }[];
  visibleByGroup: Record<GroupId, Task[]>;
  collapsed: Set<GroupId>;
  toggleGroup: (g: GroupId) => void;
  projects: Project[];
  openModal: () => void;
  openTask: (id: string) => void;
  toggleTask: (t: Task) => void;
  cyclePriority: (t: Task) => void;
  toggleFlag: (t: Task) => void;
  removeTask: (id: string) => void;
}) {
  return (
    <div className="card flex min-h-0 max-h-[calc(100dvh-12rem)] max-[800px]:max-h-[calc(100dvh-15rem)] flex-1 min-w-0 flex-col overflow-hidden">
      {/* Inner scrollable surface — only the task area scrolls. */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {totalTasks === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="relative mx-auto mb-3 block size-12 rounded-full bg-[var(--color-accent-soft)] before:absolute before:inset-[18px] before:rounded-full before:border-2 before:border-[var(--color-accent)] before:content-['']" />
            <p className="m-0 text-[0.95rem] font-semibold">No tasks yet</p>
            <p className="m-0 mt-1 text-[0.88rem] text-[var(--color-ink-muted)]">
              Capture a thought, get it done.
            </p>
            <button
              type="button"
              onClick={openModal}
              data-tour="create-task"
              className="btn-base btn-primary mt-[0.85rem]"
            >
              Create your first task
            </button>
          </div>
        ) : totalVisible === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <p className="m-0 text-[0.95rem] font-semibold">
              {filter === "done"
                ? "Nothing finished yet"
                : filter === "today"
                  ? "Nothing due today"
                  : filter === "week"
                    ? "Nothing due this week"
                    : "No open tasks"}
            </p>
            <p className="m-0 mt-1 text-[0.88rem] text-[var(--color-ink-muted)]">
              Try a different filter or add a new one.
            </p>
            {/* The copy invites "add a new one" — the board's only other "+"
                is the To-do group header, and this state renders when no
                group is on screen at all. So the button has to be here. */}
            <button
              type="button"
              onClick={openModal}
              data-tour="create-task"
              className="btn-base btn-primary mt-[0.85rem]"
            >
              New task
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {visibleGroups.map((g) => {
              const items = visibleByGroup[g.id];
              const isCollapsed = collapsed.has(g.id);
              // PRD-11: the To-do group STAYS on the board even when empty —
              // its header carries the only "+" that opens New task, so it
              // must never vanish (an in-progress-only board used to lose
              // the ability to create anything). Other groups keep their
              // hide-when-empty behaviour.
              if (items.length === 0 && g.id !== "todo") return null;
              return (
                <div key={g.id} className="flex flex-col">
                  <div className="group flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-[var(--color-surface-2)]">
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className="flex cursor-pointer items-center gap-1.5"
                    >
                      <svg
                        className={cn(
                          "size-3 text-[var(--color-ink-faint)] transition-transform duration-[140ms]",
                          isCollapsed && "-rotate-90"
                        )}
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 9l6 6 6-6"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-[0.85rem] font-semibold tracking-[-0.005em] text-[var(--color-ink)]">
                        {g.name}
                      </span>
                      <span className="text-[0.82rem] text-[var(--color-ink-faint)]">
                        {items.length}
                      </span>
                    </button>
                    {g.id === "todo" && (
                      <button
                        type="button"
                        onClick={openModal}
                        aria-label="New task"
                        data-tour="create-task"
                        className="grid size-5 cursor-pointer place-items-center text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                      >
                        <PlusSmallIcon />
                      </button>
                    )}
                  </div>

                  {/* Collapse is measured by framer-motion (`height: "auto"`
                      in lib/motion.ts), which is the whole reason this
                      doesn't need a scrollHeight in an effect. */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.ul
                        key="rows"
                        variants={collapseVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        className="m-0 flex list-none flex-col overflow-hidden p-0"
                      >
                        {items.map((t) => {
                          const done = t.status === "done";
                          return (
                            <TaskRow
                              key={t.id}
                              task={t}
                              done={done}
                              project={
                                t.project_id
                                  ? (projects.find((p) => p.id === t.project_id) ?? null)
                                  : null
                              }
                              onOpen={() => openTask(t.id)}
                              onToggle={() => toggleTask(t)}
                              onCyclePriority={() => cyclePriority(t)}
                              onToggleFlag={() => toggleFlag(t)}
                              onDelete={() => removeTask(t.id)}
                            />
                          );
                        })}
                        {/* The To-do group's empty state (it is the only group
                            that renders at zero). */}
                        {items.length === 0 && (
                          <li className="m-0 list-none px-2 py-1.5 text-[0.78rem] text-[var(--color-ink-faint)]">
                            Nothing queued yet.
                          </li>
                        )}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
