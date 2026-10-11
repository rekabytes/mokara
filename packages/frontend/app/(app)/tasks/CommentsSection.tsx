"use client";

import { restoreRemovedItems } from "./optimistic-list";
import { AttachmentLightbox } from "./AttachmentsSection";
import { CommentRow } from "./CommentRow";
import { CloseSmallIcon, PaperclipIcon } from "./icons";
import { useAsyncError } from "@/hooks/useAsyncError";
import { api, type Attachment, type Comment, type User } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { listItemVariants } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// The drawer's comment thread: `CommentsSection` (list, the 60-second `now`
// clock, error notice) and `CommentComposer` (body + paperclip + pending chips).
//
// Inserts are optimistic, and failed deletes restore only their own rows.
// The composer keeps an unposted draft on failure and cannot submit the same
// pending request twice. Confirmed posts remain saved when file uploads fail.
// The shared error banner stays visible until the next action or retry.

export function CommentsSection({
  taskId,
  currentUser,
}: {
  taskId: string;
  currentUser: User | null;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const { error: loadError, run: runLoad, clearError: clearLoadError } = useAsyncError();
  const read = useRef<AbortController | null>(null);
  const { error: actionError, clearError: clearActionError, run } = useAsyncError();
  const [now, setNow] = useState(() => Date.now());
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  // PRD-11: a clicked comment image opens the shared large view.
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const postingRef = useRef(false);
  const [posting, setPosting] = useState(false);
  const pendingRootsRef = useRef(new Set<string>());
  const [pendingRoots, setPendingRoots] = useState<ReadonlySet<string>>(new Set());

  function acquireRoot(id: string): string | null {
    const comment = comments?.find((row) => row.id === id);
    if (!comment || id.startsWith("temp-") || postingRef.current) return null;
    const root = comment.parent_id ?? id;
    if (pendingRootsRef.current.has(root)) return null;
    pendingRootsRef.current.add(root);
    setPendingRoots(new Set(pendingRootsRef.current));
    read.current?.abort();
    return root;
  }

  function releaseRoot(root: string) {
    pendingRootsRef.current.delete(root);
    setPendingRoots(new Set(pendingRootsRef.current));
  }

  // Relative timestamps need a clock, so this is a real outside-React sync:
  // one 60s tick keeps "3m ago" honest without refetching.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    read.current?.abort();
    const controller = new AbortController();
    read.current = controller;
    clearLoadError();
    const res = await runLoad(() => api.listComments(taskId, controller.signal), {
      fallback: "Couldn't load comments.",
      signal: controller.signal,
    });
    if (res) setComments(res.comments);
  }, [taskId, runLoad, clearLoadError]);

  // The thread is external server data. Abort on task change/unmount so an
  // obsolete response cannot replace the current thread or redirect it.
  useEffect(() => {
    void load();
    return () => read.current?.abort();
  }, [load]);

  // Keep the newest comment in view as the list grows. Writing scrollHeight is
  // imperative DOM work with no declarative equivalent, so this effect stays.
  const count = comments?.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  async function submit(body: string, parentId?: string, files?: File[]) {
    if (
      !currentUser ||
      comments === null ||
      postingRef.current ||
      (parentId && pendingRootsRef.current.has(parentId))
    )
      return false;
    postingRef.current = true;
    setPosting(true);
    read.current?.abort();
    clearActionError();
    try {
      const iso = new Date().toISOString();
      // Optimistic insert — feels instant; reconciled (or rolled back) when the
      // request settles.
      const temp: Comment = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        task_id: taskId,
        author_id: currentUser.id,
        author: currentUser,
        parent_id: parentId ?? null,
        body,
        attachments: [],
        created_at: iso,
        updated_at: iso,
      };
      setComments((cs) => [...(cs ?? []), temp]);
      const res = await run(() => api.createComment(taskId, body, parentId), {
        fallback: "Failed to post comment",
        // Undo the optimistic insert; the hook already surfaced the failure.
        onError: () => setComments((cs) => (cs ?? []).filter((c) => c.id !== temp.id)),
      });
      if (!res) return false;
      setComments((cs) => (cs ?? []).map((c) => (c.id === temp.id ? res.comment : c)));
      setReplyTo(null);

      // PRD-11: the files upload AFTER the comment exists, one at a time, and
      // each one folds into that comment's embedded list as it lands — so an
      // image appears the moment its bytes are stored.
      for (const file of files ?? []) {
        const up = await run(() => api.uploadCommentAttachment(res.comment.id, file), {
          fallback: "Failed to attach the file",
        });
        if (up)
          setComments((cs) =>
            (cs ?? []).map((c) =>
              c.id === res.comment.id ? { ...c, attachments: [...c.attachments, up.attachment] } : c
            )
          );
      }
      return true;
    } finally {
      postingRef.current = false;
      setPosting(false);
    }
  }

  async function saveEdit(id: string, prevBody: string, body: string) {
    const root = acquireRoot(id);
    if (!root) return;
    try {
      clearActionError();
      setComments((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, body } : c)));
      const res = await run(() => api.updateComment(id, body), {
        fallback: "Failed to save comment",
        onError: () =>
          setComments((cs) => (cs ?? []).map((c) => (c.id === id ? { ...c, body: prevBody } : c))),
      });
      if (res) setComments((cs) => (cs ?? []).map((c) => (c.id === id ? res.comment : c)));
    } finally {
      releaseRoot(root);
    }
  }

  async function remove(id: string) {
    const root = acquireRoot(id);
    if (!root) return;
    try {
      clearActionError();
      const prev = comments ?? [];
      const removed = new Set(
        prev.filter((c) => c.id === id || c.parent_id === id).map((c) => c.id)
      );
      setReplyTo((r) => (r && (r.id === id || r.parent_id === id) ? null : r));
      // Mirror the DB cascade locally: deleting a comment drops its replies.
      setComments((current) => (current ?? []).filter((c) => !removed.has(c.id)));
      await run(() => api.deleteComment(id), {
        fallback: "Failed to delete comment",
        onError: () => setComments((current) => restoreRemovedItems(current ?? [], prev, removed)),
      });
    } finally {
      releaseRoot(root);
    }
  }

  // One level of threading: roots in arrival order, replies grouped under
  // their parent (the backend already flattens replies-to-replies to roots).
  const threads = useMemo(() => {
    const cs = comments ?? [];
    const roots = cs.filter((c) => c.parent_id === null);
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of cs) {
      if (!c.parent_id) continue;
      const arr = repliesByParent.get(c.parent_id);
      if (arr) arr.push(c);
      else repliesByParent.set(c.parent_id, [c]);
    }
    return { roots, repliesByParent };
  }, [comments]);

  return (
    <section className="mt-5 flex min-h-0 flex-1 flex-col" aria-label="Comments">
      <div className="flex items-center gap-2">
        <h3 className="text-[0.74rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Comments
        </h3>
        {count > 0 && (
          <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-px text-[0.68rem] font-medium text-[var(--color-ink-faint)]">
            {count}
          </span>
        )}
      </div>

      {/* The tall scroll region — the discussion can grow without bound while
          title/description/chips stay fixed above. (The checklist above has its
          own capped scroller since PRD-11; this is still the only region that
          grows with content.) */}
      <div ref={listRef} className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {loadError && (
          <div className="text-[0.8rem] text-[var(--color-ink-faint)]">
            <ErrorBanner message={loadError.message} />
            <button
              type="button"
              onClick={load}
              className="cursor-pointer text-[var(--color-accent)] underline"
            >
              Retry
            </button>
          </div>
        )}
        {comments !== null && comments.length === 0 ? (
          <p className="text-[0.8rem] text-[var(--color-ink-faint)]">
            No comments yet. Start the conversation.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {threads.roots.map((c) => {
              const replies = threads.repliesByParent.get(c.id) ?? [];
              return (
                <motion.div
                  key={c.id}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <CommentRow
                    disabled={posting || pendingRoots.has(c.id) || c.id.startsWith("temp-")}
                    comment={c}
                    now={now}
                    isOwn={currentUser?.id === c.author_id}
                    onSave={(body) => saveEdit(c.id, c.body, body)}
                    onDelete={() => remove(c.id)}
                    onReply={() => setReplyTo(c)}
                    onPreview={setViewing}
                  />
                  {/* Replies fade in under their parent as a block; no `layout`
                      here — nested layout nodes inside this force-scrolled,
                      overflow-clipped list is where motion gets smeared. */}
                  <AnimatePresence initial={false}>
                    {replies.length > 0 && (
                      <motion.div
                        key="replies"
                        variants={listItemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="ml-3 mt-3 space-y-3 border-l border-[var(--color-border-soft)] pl-3.5"
                      >
                        {replies.map((r) => (
                          <CommentRow
                            key={r.id}
                            disabled={posting || pendingRoots.has(c.id) || r.id.startsWith("temp-")}
                            comment={r}
                            now={now}
                            isOwn={currentUser?.id === r.author_id}
                            replyToUsername={c.author.username}
                            onSave={(body) => saveEdit(r.id, r.body, body)}
                            onDelete={() => remove(r.id)}
                            onReply={() => setReplyTo(r)}
                            onPreview={setViewing}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <ErrorBanner className="mt-1.5" message={actionError?.message} />

      {currentUser && (
        // `key` is what makes the composer's prefill declarative: changing the
        // reply target remounts it, so the @mention is its initial value and
        // autoFocus re-fires — no change-detecting effect.
        <CommentComposer
          key={replyTo?.id ?? "root"}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSubmit={submit}
          disabled={
            comments === null ||
            posting ||
            (replyTo !== null && pendingRoots.has(replyTo.parent_id ?? replyTo.id))
          }
        />
      )}

      {/* Same large view the task Files list uses — one component, one set of
          rules, two surfaces. */}
      <AttachmentLightbox attachment={viewing} onClose={() => setViewing(null)} />
    </section>
  );
}

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
      <div className="mt-1.5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[0.7rem] text-[var(--color-ink-faint)]">
          {/* PRD-11: images and PDFs ride along with the text; the route
              rejects anything else, so the picker narrows the obvious paths
              and the server stays the only judge. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach an image or PDF"
            disabled={busy}
            className="grid size-6 cursor-pointer place-items-center rounded-md text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <PaperclipIcon />
          </button>
          <span>
            <kbd className="rounded border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-1 font-mono text-[0.66rem]">
              ⌘
            </kbd>
            +Enter to post
          </span>
        </span>
        <input
          ref={fileRef}
          type="file"
          disabled={busy}
          multiple
          accept="image/*,application/pdf"
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
