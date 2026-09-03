"use client";

import { atom, useAtom } from "jotai";
import type { TaskStatus } from "./api";

// Which slice of the task board a user is looking at is a per-user preference,
// not page state: it currently dies on every navigation, so jumping to
// /teams/x and back resets Active→filter, forgets the sort and re-opens every
// collapsed group. Module-level atoms in the default store (no <Provider>
// anywhere in this app) keep it alive for the lifetime of the tab, and any
// future surface — a keyboard shortcut, a deep link, the sidebar — can read
// the same value without prop-drilling.
//
// Same pattern as lib/session.ts, lib/containers.ts and lib/meta.ts: atoms
// here are the source of truth; components useAtom() them directly. Deliberately
// NOT here: the task list itself, the open drawer and the create-modal fields —
// each has exactly one consumer and no reason to outlive the page.

export type TaskFilter = "active" | "today" | "week" | "done";
export type TaskSort = "manual" | "priority" | "due";
/** A board column is a status; the alias keeps the group code readable. */
export type GroupId = TaskStatus;

export const taskFilterAtom = atom<TaskFilter>("active");
export const taskSortAtom = atom<TaskSort>("manual");
export const collapsedGroupsAtom = atom<Set<GroupId>>(new Set<GroupId>());

/**
 * Collapse state for one group plus the toggle. Returned helpers are plain
 * functions: `setCollapsed` from jotai is a stable identity, so nothing here
 * needs memoising and no effect is involved.
 */
export function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useAtom(collapsedGroupsAtom);
  return {
    collapsed,
    toggleGroup(g: GroupId) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(g)) next.delete(g);
        else next.add(g);
        return next;
      });
    },
  };
}
