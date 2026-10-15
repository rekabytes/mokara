"use client";

import { useRef, useState } from "react";
import type { Comment } from "@/lib/api";
import { CloseSmallIcon, PaperclipIcon } from "./icons";

export function CommentComposer({
  replyTo,
  onCancelReply,
  onSubmit,
  disabled = false,
}: {
  disabled?: boolean;
  replyTo: Comment | null;
  onCancelReply: () => void;
  onSubmit: (body: string, parentId?: string, files?: File[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() =>
    // The mention is the initial value, not a value copied in later. Combined
    // with the `key` at the call site (which remounts this composer whenever
    // the reply target changes), that replaces an effect whose whole job was
    // "when replyTo changes, overwrite the draft and focus".
    replyTo ? `@${replyTo.author.username} ` : ""
  );
  // PRD-11: images and PDFs ride along with the text. They upload after the
  // comment exists, so they're held here as raw Files until submit.
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (disabled || pending.current) return;
    const body = draft.trim();
    if (!body) return;
    // Threading is one level deep — replying to a reply targets the root.
    pending.current = true;
    setSubmitting(true);
    try {
      const posted = await onSubmit(
        body,
        replyTo ? (replyTo.parent_id ?? replyTo.id) : undefined,
        files.length > 0 ? files : undefined
      );
      if (posted) {
        setDraft("");
        setFiles([]);
      }
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  function cancelReply() {
    onCancelReply();
    setDraft("");
  }

  const busy = disabled || submitting;

  return (
    // PRD-13: the walkthrough frames the composer as a whole on an ACT step, so
    // typing, the paperclip (never required) and the Comment button are all
    // live at once.
    <div
      className="mt-2.5 border-t border-[var(--color-border-soft)] pt-2.5"
      data-tour="drawer-composer"
      aria-busy={busy}
    >
      {replyTo && (
        <div className="mb-1.5 flex items-center justify-between rounded-md bg-[var(--color-surface)] px-2.5 py-1.5">
          <span className="truncate text-[0.72rem] text-[var(--color-ink-muted)]">
            Replying to{" "}
            <span className="font-medium text-[var(--color-accent)]">
              @{replyTo.author.username}
            </span>
          </span>
          <button
            type="button"
            aria-label="Cancel reply"
            disabled={busy}
            onClick={cancelReply}
            className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <CloseSmallIcon />
          </button>
        </div>
      )}
      <textarea
        disabled={busy}
        ref={taRef}
        // Only when replying — otherwise opening a task drawer would yank
        // focus into the comment box. Caret lands at the end of the seeded
        // mention, which is where the old setSelectionRange put it.
        autoFocus={replyTo !== null}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && replyTo) {
            e.preventDefault();
            cancelReply();
          }
        }}
        aria-label="Comment (Markdown supported)"
        rows={2}
        placeholder={replyTo ? `Reply to @${replyTo.author.username}…` : "Add a comment…"}
        className="w-full resize-none rounded-md border border-[var(--color-border-soft)] bg-white px-2.5 py-2 text-[0.85rem] leading-[1.5] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-accent)]"
      />
      {files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="flex max-w-full items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.15rem] text-[0.72rem] text-[var(--color-ink-muted)]"
            >
              <span className="min-w-0 truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                disabled={busy}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="grid size-3.5 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-danger)]"
              >
                <CloseSmallIcon />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          {/* PRD-11: images and PDFs ride along with the text; the route
              rejects anything else, so the picker narrows the obvious paths
              and the server stays the only judge. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach an image or PDF"
            title="Images: up to 3 MB each. PDFs: your workspace owner’s plan limit."
            disabled={busy}
            className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <PaperclipIcon />
          </button>
          <span>
            <kbd className="rounded border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-1 font-mono text-[0.66rem]">
              ⌘
            </kbd>
            +Enter to post · Markdown supported
          </span>
        </span>
        <input
          ref={fileRef}
          type="file"
          disabled={busy}
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files;
            if (picked && picked.length > 0) {
              setFiles((prev) => [...prev, ...Array.from(picked)]);
            }
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="cursor-pointer rounded-full bg-[var(--color-accent)] px-3 py-1 text-[0.76rem] font-medium text-white disabled:cursor-default disabled:opacity-40"
        >
          Comment
        </button>
      </div>
    </div>
  );
}
