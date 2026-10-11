"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

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
