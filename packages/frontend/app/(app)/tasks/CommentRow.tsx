"use client";

import { PaperclipIcon, PencilIcon, ReplyIcon, TrashIcon } from "./icons";
import { avatarClass, formatBytes, isImage, timeAgo, wasEdited } from "./task-format";
import { api, type Attachment, type Comment } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useState } from "react";
// One comment in the drawer thread: avatar, author, relative timestamp, body,
// its own attachments, and the reply / edit / delete affordances.
//
// Replies flatten to the root (the API keeps one level of nesting), edit and
// delete are AUTHOR-ONLY, and an edited comment says so via `wasEdited`.
// Timestamps age against a single `now` clock owned by `CommentsSection` and
// threaded down as a prop, so the thread does not re-render every row on its
// own timer.

export function CommentRow({
  comment,
  now,
  isOwn,
  replyToUsername,
  onSave,
  onDelete,
  onReply,
  onPreview,
}: {
  comment: Comment;
  now: number;
  isOwn: boolean;
  replyToUsername?: string;
  onSave: (body: string) => void;
  onDelete: () => void;
  onReply: () => void;
  onPreview: (a: Attachment) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);

  const name = comment.author.display_name || comment.author.username;
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  function startEdit() {
    setDraft(comment.body);
    setEditing(true);
  }

  function commitEdit() {
    const body = draft.trim();
    setEditing(false);
    if (body && body !== comment.body) onSave(body);
    else setDraft(comment.body);
  }

  return (
    <article className="group flex gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[0.68rem] font-semibold",
          avatarClass(comment.author.username)
        )}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[0.8rem] font-medium text-[var(--color-ink)]">{name}</span>
          <span className="shrink-0 text-[0.7rem] text-[var(--color-ink-faint)]">
            {timeAgo(comment.created_at, now)}
            {wasEdited(comment) && " (edited)"}
          </span>
          {/* Row actions — revealed on hover, no fade (decisive). Reply is
              for everyone; edit/delete only on own comments. */}
          {!editing && (
            <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              {confirming ? (
                <span className="flex items-center gap-1 text-[0.7rem] text-[var(--color-danger)]">
                  Delete?
                  <button
                    type="button"
                    onClick={onDelete}
                    className="cursor-pointer font-medium underline"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="cursor-pointer text-[var(--color-ink-muted)] underline"
                  >
                    No
                  </button>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label="Reply to comment"
                    onClick={onReply}
                    className="grid size-5 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                  >
                    <ReplyIcon />
                  </button>
                  {isOwn && (
                    <>
                      <button
                        type="button"
                        aria-label="Edit comment"
                        onClick={startEdit}
                        className="grid size-5 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete comment"
                        onClick={() => setConfirming(true)}
                        className="grid size-5 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                      >
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </>
              )}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(comment.body);
                  setEditing(false);
                } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitEdit();
                }
              }}
              rows={2}
              className="w-full resize-none rounded-md border border-[var(--color-border-soft)] bg-white px-2 py-1.5 text-[0.83rem] leading-[1.5] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={commitEdit}
                disabled={!draft.trim()}
                className="cursor-pointer rounded-full bg-[var(--color-accent)] px-2.5 py-0.5 text-[0.72rem] font-medium text-white disabled:cursor-default disabled:opacity-40"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(false);
                }}
                className="cursor-pointer rounded-full px-2.5 py-0.5 text-[0.72rem] font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Linkage chip — makes the reply's parent explicit, not just
                implied by indentation. */}
            {replyToUsername && (
              <p className="mt-0.5 text-[0.7rem] text-[var(--color-ink-faint)]">
                ↳ replying to{" "}
                <span className="font-medium text-[var(--color-accent)]">@{replyToUsername}</span>
              </p>
            )}
            <p className="mt-0.5 whitespace-pre-wrap break-words text-[0.83rem] leading-[1.5] text-[var(--color-ink)]">
              {comment.body}
            </p>
            {comment.attachments.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {comment.attachments.map((a) =>
                  isImage(a) ? (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onPreview(a)}
                      aria-label={`Preview ${a.filename}`}
                      className="cursor-pointer"
                    >
                      <img
                        src={api.attachmentDownloadUrl(a.id)}
                        alt={a.filename}
                        className="size-14 rounded-[8px] border border-[var(--color-border-soft)] object-cover"
                      />
                    </button>
                  ) : (
                    <a
                      key={a.id}
                      href={api.attachmentDownloadUrl(a.id)}
                      download={a.filename}
                      title={a.filename}
                      className="flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.15rem] text-[0.72rem] text-[var(--color-ink)] underline-offset-2 hover:bg-[var(--color-surface-2)] hover:underline"
                    >
                      <PaperclipIcon />
                      <span className="max-w-[16rem] truncate">{a.filename}</span>
                      <span className="shrink-0 font-mono text-[0.66rem] text-[var(--color-ink-faint)]">
                        {formatBytes(a.size_bytes)}
                      </span>
                    </a>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
