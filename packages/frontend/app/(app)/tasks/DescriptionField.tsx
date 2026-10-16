"use client";

import { useState } from "react";
import { TASK_DESCRIPTION_MAX_CHARACTERS } from "./task-content";
import { TaskMarkdown } from "./TaskMarkdown";

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
    if (draft.trim().length > TASK_DESCRIPTION_MAX_CHARACTERS) return;
    setEditing(false);
    if (draft !== value) onSave(draft);
    else setDraft(value);
  }

  if (editing) {
    return (
      <>
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
          aria-label="Task description (Markdown supported)"
          aria-describedby="task-description-limit"
          aria-invalid={draft.trim().length > TASK_DESCRIPTION_MAX_CHARACTERS}
          rows={8}
          placeholder="Add description…"
          className="mt-3 min-h-[10rem] shrink-0 w-full resize-y rounded-md border border-[var(--color-border-soft)] bg-white px-2.5 py-2 text-[0.92rem] leading-[1.5] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        />
        <p
          id="task-description-limit"
          role="status"
          className="mt-1 text-[0.7rem] text-[var(--color-ink-muted)]"
        >
          {draft.trim().length.toLocaleString()} /{" "}
          {TASK_DESCRIPTION_MAX_CHARACTERS.toLocaleString()} characters. Shorten the description to
          save if it exceeds the limit.
        </p>
      </>
    );
  }

  return (
    <section
      className="mt-3 shrink-0 min-w-0"
      data-tour="drawer-description"
      aria-label="Description"
    >
      {value ? (
        <div
          onClick={(event) => {
            // Links and read-only Markdown checkboxes keep their own behavior.
            if (
              event.target instanceof Element &&
              event.target.closest("a, button, input, pre, .task-markdown-table")
            )
              return;
            startEdit();
          }}
          className="-mx-2 cursor-text rounded-md px-2 py-1.5 text-[0.92rem] leading-[1.6] text-[var(--color-ink)] hover:bg-[var(--color-surface-2)]"
        >
          <TaskMarkdown>{value}</TaskMarkdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="text-[0.92rem] text-[var(--color-ink-faint)]"
        >
          Add description…
        </button>
      )}
      <div className="mt-1 flex items-center gap-2 text-[0.7rem] text-[var(--color-ink-muted)]">
        {value && (
          <button
            type="button"
            onClick={startEdit}
            className="cursor-pointer rounded px-1 py-0.5 hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            Edit description
          </button>
        )}
        <span>Markdown supported</span>
      </div>
    </section>
  );
}
