"use client";

// Board model for the tasks route: the shared member atom, the filter/sort/group
// option lists, and the priority/status tables.
//
// Module scope is load-bearing, not tidiness. Every component in this folder
// must read ONE instance of `containerMembersAtom` — if a future split ever
// re-declared it, the drawer's and the create-modal's assignee lists would
// become two disconnected stores and drift apart with no error anywhere.
import { atom } from "jotai";
import type { TaskPriority, TaskStatus, TeamMember } from "@/lib/api";
import type { GroupId, TaskFilter, TaskSort } from "@/lib/tasksView";

// PRD-10/11: members of the current container, shared by the drawer's and the
// create-modal's AssigneeChip. Written by the page-level fetch (outside React)
// so both read the same list — neither component fetches its own.
export const containerMembersAtom = atom<TeamMember[]>([]);

// Gap between a trigger and the menu that opens under it, and the same number
// used by the drawer's width animation. Module scope so `placeBelow`'s
// useCallback can legitimately depend on nothing.
export const MENU_GAP = 4;

export const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "done", label: "Done" },
];

export const SORTS: { id: TaskSort; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "priority", label: "Priority" },
  { id: "due", label: "Due date" },
];

export const GROUPS: { id: GroupId; name: string }[] = [
  { id: "todo", name: "Todo" },
  { id: "in_progress", name: "In Progress" },
  { id: "done", name: "Done" },
  { id: "canceled", name: "Canceled" },
];

// Derived from the data the page already has, so the dropdowns and the sort
// loops can list statuses/priorities without re-declaring (and re-casting) the
// same four/five literals in five places.
export const GROUP_IDS: GroupId[] = GROUPS.map((g) => g.id);
export const STATUS_IDS: TaskStatus[] = GROUP_IDS;
export const PRIORITY_IDS: TaskPriority[] = ["low", "medium", "high"];

export const PRIORITY_BAR_COLOR: Record<TaskPriority, string> = {
  high: "bg-[var(--color-prio-high)]",
  medium: "bg-[var(--color-prio-medium)]",
  low: "bg-[var(--color-ink-faint)]",
};

export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  canceled: "Canceled",
};
