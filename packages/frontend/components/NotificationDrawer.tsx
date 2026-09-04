"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { notifDrawerVariants } from "@/lib/motion";
import { useNotifications } from "@/lib/notifications";
import { useContainers } from "@/lib/containers";
import { api, type NotificationInfo } from "@/lib/api";
import { normalizeError } from "@/lib/errors";

// PRD-05: the right-side notification drawer — non-blocking (no backdrop; the
// page stays usable), mounted once in AppShell so it is available on every
// page. Rows are deep-links: clicking marks the row read and navigates into
// the payload's container. Invitation rows carry Accept/Decline buttons
// straight from the notification; the server updates the row's payload
// (`responded`) and republishes over SSE, so the buttons become a state chip
// on every device.

const ICONS: Record<string, { glyph: string; className: string }> = {
  task_assigned: {
    glyph: "@",
    className: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  },
  invitation: { glyph: "✉", className: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" },
  invitation_accepted: {
    glyph: "✓",
    className: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  },
  comment_reply: { glyph: "↩", className: "bg-[rgba(14,165,233,0.14)] text-[#0284c7]" },
};

function iconFor(type: string) {
  return (
    ICONS[type] ?? {
      glyph: "•",
      className: "bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]",
    }
  );
}

function when(iso: string): string {
  const diffS = Math.max(0, Date.now() / 1000 - new Date(iso).getTime() / 1000);
  if (diffS < 60) return "just now";
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h`;
  return `${Math.floor(diffS / 86400)}d`;
}

export function NotificationDrawer() {
  const { list, unread, open, setOpen, markAllRead, markRead } = useNotifications();
  const router = useRouter();
  const { setSelectedId } = useContainers();
  const [actionError, setActionError] = useState<string | null>(null);

  // Esc closes the drawer — a listener on the window (outside React), the
  // documented allowed effect.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const onRowClick = (n: NotificationInfo) => {
    if (!n.read_at) void markRead(n.id);
    setOpen(false);
    // Deep-link into the payload's container; the switcher follows so the
    // board lands on the right workspace.
    const teamId = n.payload.team_id;
    if (teamId) setSelectedId(teamId);
    router.push("/tasks");
  };

  // PRD-05: accept/decline straight from the row. The server updates the
  // notification's payload (`responded`) and republishes over SSE, so the row
  // swaps its buttons for a state chip on every device; the row is also
  // read-marked. Errors (team_full, already responded) show inline.
  const onInviteRespond = async (n: NotificationInfo, action: "accept" | "decline") => {
    setActionError(null);
    if (!n.payload.invitation_id) return;
    try {
      await api.respondToInvitation(n.payload.invitation_id, action);
      await markRead(n.id);
    } catch (e) {
      setActionError(normalizeError(e, "Couldn't respond to the invitation. Try again.").message);
    }
  };

  const todayKey = new Date().toDateString();

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          variants={notifDrawerVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          role="dialog"
          aria-label="Notifications"
          className="fixed right-0 top-0 z-50 flex h-dvh w-[400px] max-w-full flex-col border-l border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] shadow-[var(--shadow-lift)]"
        >
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--color-border-soft)] px-4.5 pb-3 pt-4">
            <div className="text-[0.9rem] font-extrabold">
              Notifications{" "}
              <span className="text-[0.72rem] font-semibold text-[var(--color-ink-faint)]">
                · {unread} unread
              </span>
            </div>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
              className="grid size-7 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pb-3">
            {actionError && (
              <p className="mx-4.5 mb-1 rounded-[10px] border border-[var(--color-danger-border)] bg-[var(--color-danger-soft)] px-3 py-2 text-[0.75rem] text-[var(--color-danger)]">
                {actionError}
              </p>
            )}
            {list === null && (
              <p className="px-4.5 py-3 text-[0.8rem] text-[var(--color-ink-faint)]">Loading…</p>
            )}
            {list !== null && list.length === 0 && (
              <p className="px-4.5 py-3 text-[0.8rem] text-[var(--color-ink-faint)]">
                Nothing yet — invitations, comment replies and the like land here.
              </p>
            )}
            {list?.map((n, idx) => {
              const group =
                new Date(n.created_at).toDateString() === todayKey ? "Today" : "Earlier";
              const prev = idx > 0 ? list[idx - 1] : undefined;
              const prevSameGroup =
                prev !== undefined &&
                (new Date(prev.created_at).toDateString() === todayKey) ===
                  (new Date(n.created_at).toDateString() === todayKey);
              const icon = iconFor(n.type);
              return (
                <div key={n.id}>
                  {(!prevSameGroup || idx === 0) && (
                    <div className="px-4.5 pb-1 pt-3 text-[0.66rem] font-bold uppercase tracking-[0.09em] text-[var(--color-ink-faint)]">
                      {group}
                    </div>
                  )}
                  <div
                    className={`flex w-full items-start gap-3 px-4.5 py-2.5 transition-colors hover:bg-[var(--color-surface-2)] ${
                      idx > 0 ? "border-t border-[var(--color-border-soft)]" : ""
                    }`}
                  >
                    <span
                      className={`grid size-8 flex-none place-items-center rounded-[10px] text-[0.9rem] ${icon.className}`}
                    >
                      {icon.glyph}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onRowClick(n)}
                        className="block w-full cursor-pointer text-left"
                      >
                        <span
                          className={`block text-[0.8rem] leading-[1.35] text-[var(--color-ink)] ${
                            n.read_at ? "" : "font-semibold"
                          }`}
                        >
                          <b>{n.payload.actor_username ?? "Someone"}</b>{" "}
                          {n.type === "invitation" && (
                            <>
                              invited you to join <b>{n.payload.team_name ?? "a container"}</b>
                            </>
                          )}
                          {n.type === "task_assigned" && (
                            <>
                              assigned you to <b>{n.payload.task_title ?? "a task"}</b>
                            </>
                          )}
                          {n.type === "invitation_accepted" && (
                            <>
                              accepted your invitation to{" "}
                              <b>{n.payload.team_name ?? "a container"}</b>
                            </>
                          )}
                          {n.type === "comment_reply" && (
                            <>
                              replied to your comment on <b>{n.payload.task_title ?? "a task"}</b>
                            </>
                          )}
                          {!ICONS[n.type] && "sent you a notification"}
                        </span>
                        {n.payload.snippet && (
                          <span className="mt-0.5 block truncate text-[0.72rem] text-[var(--color-ink-faint)]">
                            “{n.payload.snippet}”
                          </span>
                        )}
                        <span className="mt-1 flex items-center gap-2">
                          {n.payload.team_name && (
                            <span className="max-w-[140px] truncate rounded-[var(--radius-pill)] border border-[var(--color-border-soft)] px-1.5 py-px text-[0.62rem] font-semibold text-[var(--color-ink-muted)]">
                              {n.payload.team_name}
                            </span>
                          )}
                          {n.type === "invitation" && (
                            <span className="rounded-[var(--radius-pill)] border border-[var(--color-border-soft)] px-1.5 py-px text-[0.62rem] font-semibold text-[var(--color-ink-muted)]">
                              invitation
                            </span>
                          )}
                        </span>
                      </button>
                      {n.type === "invitation" &&
                        !n.payload.responded &&
                        n.payload.invitation_id && (
                          <span className="mt-2 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => void onInviteRespond(n, "accept")}
                              className="btn-base btn-primary px-3 py-1.5 text-[0.72rem]"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => void onInviteRespond(n, "decline")}
                              className="btn-base btn-ghost border border-[var(--color-border-soft)] px-3 py-1.5 text-[0.72rem]"
                            >
                              Decline
                            </button>
                          </span>
                        )}
                      {n.type === "invitation" && n.payload.responded && (
                        <span className="mt-1.5 inline-block rounded-[var(--radius-pill)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[0.66rem] font-semibold text-[var(--color-accent)]">
                          {n.payload.responded === "accepted" ? "Joined" : "Declined"}
                        </span>
                      )}
                    </div>
                    <span className="w-10 flex-none pt-0.5 text-right text-[0.66rem] text-[var(--color-ink-faint)]">
                      {when(n.created_at)}
                    </span>
                    {!n.read_at && (
                      <span className="mt-2.5 size-1.5 flex-none rounded-full bg-[var(--color-accent)]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 border-t border-[var(--color-border-soft)] px-4.5 py-3">
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="btn-base btn-ghost flex-1 text-[0.78rem]"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-base btn-ghost flex-1 text-[0.78rem]"
            >
              Close
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
