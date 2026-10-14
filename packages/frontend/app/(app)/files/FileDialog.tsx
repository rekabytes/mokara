"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { backdropVariants, sheetVariants, reducedSheetVariants } from "@/lib/motion";
import { ErrorBanner } from "@/components/ErrorBanner";
import type { WorkspaceFolder } from "@/lib/api-types";
import type { FileDialog as Dialog } from "./file-model";
import { breadcrumbs, moveDestinations } from "./file-model";
export function FileDialog({
  dialog,
  folders,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  dialog: Dialog;
  folders: WorkspaceFolder[];
  busy: boolean;
  error?: string;
  onSubmit: (value: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(dialog.action === "rename" ? dialog.item.name : "");
  const focus = useDialogFocus(),
    reduced = useReducedMotion();
  const title =
    dialog.action === "create"
      ? "New folder"
      : `${dialog.action === "delete" ? "Permanently delete" : dialog.action.charAt(0).toUpperCase() + dialog.action.slice(1)} ${dialog.item.kind === "files" ? "file" : "folder"}`;
  const danger = dialog.action === "delete" || dialog.action === "trash";
  return (
    <motion.div
      className="files-overlay"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <motion.section
        ref={focus}
        data-focus-scope=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="files-dialog-title"
        className="files-dialog"
        variants={reduced ? reducedSheetVariants : sheetVariants}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header>
          <h2 id="files-dialog-title">{title}</h2>
          <button
            type="button"
            className="files-icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await onSubmit(value)) onClose();
          }}
        >
          {dialog.action !== "create" && <p className="files-dialog-name">{dialog.item.name}</p>}
          {dialog.action === "create" || dialog.action === "rename" ? (
            <label>
              Name
              <input
                data-autofocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                maxLength={200}
                disabled={busy}
              />
            </label>
          ) : dialog.action === "move" ? (
            <label>
              Destination
              <select
                data-autofocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={busy}
              >
                <option value="">All files</option>
                {moveDestinations(folders, dialog.item).map((folder) => (
                  <option value={folder.id} key={folder.id}>
                    {breadcrumbs(folders, folder.id)
                      .map((f) => f.name)
                      .join(" / ")}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="files-muted">
              {dialog.action === "trash"
                ? "Move this item and its contents to Trash? You can restore them for 30 days. Storage remains in use until permanent deletion."
                : dialog.action === "delete"
                  ? "This permanently deletes this item and its contents. It cannot be undone. Storage is released after cleanup finishes."
                  : "Restore this item? If its original parent folder is unavailable, it returns to All files."}
            </p>
          )}
          {error && <ErrorBanner message={error} />}
          <footer>
            <button type="button" className="btn-base btn-ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              className={`btn-base ${danger ? "files-danger" : "btn-primary"}`}
              disabled={
                busy ||
                ((dialog.action === "create" || dialog.action === "rename") && !value.trim())
              }
            >
              {busy
                ? "Saving…"
                : dialog.action === "create"
                  ? "Create folder"
                  : dialog.action === "move"
                    ? "Move here"
                    : dialog.action === "rename"
                      ? "Save name"
                      : dialog.action === "delete"
                        ? "Delete permanently"
                        : dialog.action === "trash"
                          ? "Move to Trash"
                          : "Restore"}
            </button>
          </footer>
        </form>
      </motion.section>
    </motion.div>
  );
}
