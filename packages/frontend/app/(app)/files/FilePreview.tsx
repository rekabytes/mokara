"use client";
import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import type { WorkspaceFile } from "@/lib/api-types";
import { backdropVariants } from "@/lib/motion";
import { useDialogFocus } from "@/hooks/use-dialog-focus";
import { ErrorBanner } from "@/components/ErrorBanner";
import { formatBytes } from "./file-model";
export function FilePreview({
  file,
  teamId,
  onClose,
}: {
  file: WorkspaceFile;
  teamId: string;
  onClose: () => void;
}) {
  const focus = useDialogFocus();
  const [failed, setFailed] = useState(false);
  return (
    <motion.div
      className="files-overlay"
      variants={backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <section
        ref={focus}
        className="files-preview"
        data-focus-scope=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-preview-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <header>
          <div className="min-w-0">
            <h2 id="file-preview-title">{file.name}</h2>
            <p>
              {formatBytes(file.size_bytes)} · Added by {file.uploader_name} ·{" "}
              {new Date(file.created_at).toLocaleDateString()}
            </p>
          </div>
          <button className="files-icon-button" aria-label="Close preview" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="files-preview-body">
          {failed ? (
            <ErrorBanner message="This preview could not load. Try downloading the file or reopen the preview." />
          ) : file.content_type === "application/pdf" ? (
            <iframe
              title={file.name}
              src={api.workspaceFileUrl(teamId, file.id, "preview")}
              onError={() => setFailed(true)}
            />
          ) : (
            <Image
              unoptimized
              width={1200}
              height={900}
              alt={file.name}
              src={api.workspaceFileUrl(teamId, file.id, "preview")}
              onError={() => setFailed(true)}
            />
          )}
        </div>
        <footer>
          <span className="files-muted">Visible to members of this workspace</span>
          <a
            className="btn-base btn-primary"
            href={api.workspaceFileUrl(teamId, file.id, "download")}
          >
            Download
          </a>
        </footer>
      </section>
    </motion.div>
  );
}
