"use client";

import { CloseSmallIcon, PaperclipIcon } from "./icons";
import { formatBytes, isImage } from "./task-format";
import { useAsyncError } from "@/hooks/useAsyncError";
import { api, type Attachment, type User } from "@/lib/api";
import { backdropVariants, sheetVariants } from "@/lib/motion";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
// Task attachments: `AttachmentsSection` (thumbnail grid, upload, delete) and
// `AttachmentLightbox` (the full-size view), which is EXPORTED because the
// comment thread opens the same lightbox — one overlay idiom, two callers.
//
// Rules that live here: delete is UPLOADER-ONLY (the button renders only for
// whoever uploaded the file), images and PDFs only, and the lightbox is a
// `createPortal` wrapped by `AnimatePresence` at the portal CALL so the exit
// animation owns unmount timing. Esc is caught through
// `globalThis.KeyboardEvent` in tests as well as the browser.

export function AttachmentsSection({
  taskId,
  currentUser,
}: {
  taskId: string;
  currentUser: User | null;
}) {
  // Files are a CREATION-TIME feature (owner, 2026-09-05): the New task modal
  // uploads them right after the task exists, and this section — now part of
  // the description area — only ever SHOWS them. No composer, no drop zone:
  // post-creation images belong in comments. Hidden entirely when the task has
  // none; a failed load also renders as nothing (req() already logged it),
  // which is the honest reading of "don't show if none".
  const [files, setFiles] = useState<Attachment[] | null>(null);
  // Set by clicking an image; rendered as a full-screen preview (portal).
  const [viewing, setViewing] = useState<Attachment | null>(null);
  const { error, setError, run } = useAsyncError();

  const load = useCallback(async () => {
    try {
      const res = await api.listAttachments(taskId);
      setFiles(res.attachments);
    } catch {
      setFiles(null); // an unloadable list reads as "no files" — logged in req()
    }
  }, [taskId]);

  // Server sync: load the list when the task changes (outside React).
  useEffect(() => {
    load();
  }, [load]);

  async function remove(file: Attachment) {
    const snapshot = files ?? [];
    setFiles(snapshot.filter((f) => f.id !== file.id));
    // DELETE resolves void → undefined, so test for null, not falsiness.
    const ok = await run(() => api.deleteAttachment(file.id), {
      fallback: "Failed to delete the file",
      onError: () => setFiles(snapshot),
    });
    if (ok !== null) setError(null);
  }

  // A task with no files renders nothing at all (owner: "don't show if none").
  if (!files || files.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-start gap-1.5" aria-label="Files">
      {files.map((f) => {
        const mine = currentUser?.id === f.uploader.id;
        return (
          <div key={f.id} className="group relative">
            {isImage(f) ? (
              <button
                type="button"
                onClick={() => setViewing(f)}
                aria-label={`Preview ${f.filename}`}
                title={f.filename}
                className="block cursor-pointer"
              >
                <img
                  src={api.attachmentDownloadUrl(f.id)}
                  alt={f.filename}
                  className="size-14 rounded-[8px] border border-[var(--color-border-soft)] object-cover"
                />
              </button>
            ) : (
              <a
                href={api.attachmentDownloadUrl(f.id)}
                download={f.filename}
                title={`${f.filename} · ${formatBytes(f.size_bytes)}`}
                className="flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-2 py-[0.2rem] text-[0.72rem] text-[var(--color-ink)] underline-offset-2 hover:bg-[var(--color-surface-2)] hover:underline"
              >
                <PaperclipIcon />
                <span className="max-w-[12rem] truncate">{f.filename}</span>
              </a>
            )}
            {/* PRD-11: only the uploader can remove a file — and with adding
                locked to creation time, deletion is permanent. */}
            {mine && (
              <button
                type="button"
                onClick={() => remove(f)}
                aria-label={`Delete ${f.filename}`}
                className="absolute -right-1.5 -top-1.5 grid size-[18px] cursor-pointer place-items-center rounded-full border border-[var(--color-border-soft)] bg-white text-[var(--color-ink-faint)] opacity-0 transition-opacity duration-150 hover:text-[var(--color-danger)] group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <CloseSmallIcon />
              </button>
            )}
          </div>
        );
      })}

      {error && <p className="w-full text-[0.72rem] text-[var(--color-danger)]">{error.message}</p>}

      {/* Large view — shared with the comment thread (same component, same
          rules); one presence check so it animates out on close. */}
      <AttachmentLightbox attachment={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/**
 * The large view for any attachment, wherever it lives — task Files and the
 * comment thread share it so the experience is identical. Portal +
 * AnimatePresence is the NewTaskModal overlay idiom: one presence check,
 * backdrop fades while the sheet lifts, both reverse on close. Esc lives here
 * so every caller gets it for free (a keyboard listener is outside-React sync —
 * the one kind of effect this codebase allows).
 */
export function AttachmentLightbox({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachment, onClose]);

  return createPortal(
    <AnimatePresence>
      {attachment && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview of ${attachment.filename}`}
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 grid place-items-center p-4"
          onClick={onClose}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-[rgba(15,23,42,0.82)]"
          />
          <motion.figure
            variants={sheetVariants}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 max-w-[92vw] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] shadow-[var(--shadow-lift)]"
          >
            <img
              src={api.attachmentDownloadUrl(attachment.id)}
              alt={attachment.filename}
              className="max-h-[72dvh] max-w-[86vw] object-contain"
            />
            <figcaption className="flex items-center gap-2 border-t border-[var(--color-border-soft)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[0.82rem] font-medium text-[var(--color-ink)]">
                {attachment.filename}
              </span>
              <span className="shrink-0 font-mono text-[0.7rem] text-[var(--color-ink-faint)]">
                {formatBytes(attachment.size_bytes)} ·{" "}
                {attachment.uploader.display_name || attachment.uploader.username}
              </span>
              <a
                href={api.attachmentDownloadUrl(attachment.id)}
                download={attachment.filename}
                className="btn-base btn-primary shrink-0"
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.78rem" }}
              >
                Download
              </a>
            </figcaption>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
