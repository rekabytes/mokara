// Pure helpers for the tasks route: date/byte/id formatting, the avatar colour
// pick, the comment "was edited" test, the attachment image test, and the SSE
// board-event payload guard.
//
// No React, no DOM, no Jotai — so every one of these can be asserted in a
// one-shot script instead of only in a browser. Date math anchors on LOCAL
// midnight (`new Date(y, m, d)` / setHours(0,0,0,0)); never derive a day index
// from a live timestamp or an `.toISOString()` round-trip.

import type { Attachment, Comment, Task } from "@/lib/api";

/**
 * Board-event payload guard (SSE). The wire contract is the server's shape()
 * output — byte-identical to what the REST task routes return — so this
 * validates the fields the board branches on (identity, routing, grouping,
 * and the two arrays the drawer chips read), not all fourteen. A frame that
 * fails it is ignored, never half-applied.
 */
export function asBoardTask(v: unknown): Task | null {
  if (v === null || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id === "string" &&
    typeof o.team_id === "string" &&
    typeof o.title === "string" &&
    typeof o.status === "string" &&
    typeof o.priority === "string" &&
    Array.isArray(o.kpis) &&
    Array.isArray(o.subtasks)
  ) {
    return v as Task;
  }
  return null;
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const dow = now.getDay();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function shortId(t: Task): string {
  return t.id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

export const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

export function avatarClass(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function timeAgo(iso: string, now: number): string {
  const mins = Math.floor(Math.max(0, now - Date.parse(iso)) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function wasEdited(c: Comment): boolean {
  return Math.abs(Date.parse(c.updated_at) - Date.parse(c.created_at)) > 1000;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

// Images get a thumbnail + large view; everything else is a row with a
// download link. The content type is the server's measurement of the bytes,
// not the browser's guess from the extension.
export function isImage(a: Attachment): boolean {
  return a.content_type.startsWith("image/");
}
