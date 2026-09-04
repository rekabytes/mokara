"use client";

import { openNotificationCenter, useNotifications } from "@/lib/notifications";

// The header bell (PRD-05) — badge shows the unread count; clicking opens the
// right-side notification drawer. One shared component on every page's
// breadcrumb bar, replacing the four copied placeholder buttons.

export function NotificationBell() {
  const unread = useNotifications().unread;

  return (
    <button
      type="button"
      aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
      onClick={openNotificationCenter}
      className="relative grid size-8 cursor-pointer place-items-center rounded-md text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
    >
      <span className="relative">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 16V11a6 6 0 1112 0v5l1.5 2H4.5L6 16z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-[var(--radius-pill)] border-2 border-[#f1f2fa] bg-[var(--color-danger)] px-0.5 text-[0.6rem] font-extrabold leading-[10px] text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
    </button>
  );
}
