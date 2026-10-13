"use client";

import { useTaskComments } from "./use-task-comments";
import { CommentComposer } from "./CommentComposer";
import { AttachmentLightbox } from "./AttachmentsSection";
import { CommentRow } from "./CommentRow";
import { type Attachment, type User } from "@/lib/api";
import { ErrorBanner } from "@/components/ErrorBanner";
import { listItemVariants } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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
  const {
    comments,
    loadError,
    actionError,
    load,
    replyTo,
    setReplyTo,
    posting,
    pendingRoots,
    submit,
    saveEdit,
    remove,
    threads,
  } = useTaskComments(taskId, currentUser);
  const [now, setNow] = useState(() => Date.now());
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Relative timestamps need a clock, so this is a real outside-React sync:
  // one 60s tick keeps "3m ago" honest without refetching.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Keep the newest comment in view as the list grows. Writing scrollHeight is
  // imperative DOM work with no declarative equivalent, so this effect stays.
  const count = comments?.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <section className="task-comments mt-5 flex min-h-0 flex-1 flex-col" aria-label="Comments">
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
