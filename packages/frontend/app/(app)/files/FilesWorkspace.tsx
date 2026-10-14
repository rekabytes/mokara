"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { FileQuery, WorkspaceFile } from "@/lib/api-types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useFiles } from "./use-files";
import {
  breadcrumbs,
  formatBytes,
  visibleFolders,
  type FileItem,
  type FileDialog as Dialog,
} from "./file-model";
import { FileIcon } from "./file-icons";
import { FileDialog } from "./FileDialog";
import { FilePreview } from "./FilePreview";
export function FilesWorkspace({ teamId, name }: { teamId: string; name: string }) {
  const files = useFiles(teamId),
    { data, query } = files;
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [preview, setPreview] = useState<WorkspaceFile | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const trash = query.view === "trash",
    folders = data?.folders ?? [];
  const children = visibleFolders(folders, { ...query, q: files.search });
  const usage = data?.usage;
  const canUpload = Boolean(data?.storage_configured) && !trash && !files.loading;
  const openDialog = (next: Dialog) => {
    files.clearError();
    setDialog(next);
  };
  const changeView = (view: "files" | "trash") => {
    files.setSearch("");
    files.setQuery({ ...query, view, folder_id: undefined, page: 1 });
  };
  return (
    <div className="files-workspace">
      <header className="files-heading">
        <div>
          <span className="files-eyebrow">{name}</span>
          <h1>
            Your team’s files,
            <br className="files-mobile-break" /> in one place.
          </h1>
          <p className="files-muted">Shared with your workspace. Organized your way.</p>
        </div>
        <div className="files-heading-actions">
          <button
            className="btn-base btn-ghost"
            disabled={!data || trash || files.loading}
            onClick={() => openDialog({ action: "create" })}
          >
            <FileIcon kind="folder" />
            New folder
          </button>
          <button
            className="btn-base btn-primary"
            disabled={!canUpload}
            onClick={() => input.current?.click()}
          >
            <FileIcon kind="upload" />
            Upload files
          </button>
        </div>
      </header>
      <input
        ref={input}
        className="sr-only"
        type="file"
        tabIndex={-1}
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
        onChange={(e) => {
          files.addUploads(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <section className="files-storage" aria-label="Storage usage">
        <div>
          <FileIcon kind="folder" />
          <span>
            This workspace<strong>{usage ? formatBytes(usage.workspace_used_bytes) : "—"}</strong>
          </span>
        </div>
        <div className="files-account-usage">
          <span>
            Owner’s shared storage
            <strong>
              {usage
                ? `${formatBytes(usage.account_used_bytes)} / ${usage.account_limit_bytes === null ? "Unlimited" : formatBytes(usage.account_limit_bytes)}`
                : "—"}
            </strong>
          </span>
          <progress
            aria-label="Owner storage used"
            max={usage?.account_limit_bytes ?? Math.max(1, usage?.account_used_bytes ?? 1)}
            value={usage?.account_used_bytes ?? 0}
          />
        </div>
        <p>
          Uploads use the workspace owner’s allowance, shared across all their workspaces.
          {usage && (
            <>
              {" "}
              Up to{" "}
              {usage.file_limit_bytes === null
                ? "unlimited size"
                : formatBytes(usage.file_limit_bytes)}{" "}
              per file.
            </>
          )}
        </p>
      </section>
      <section
        className="files-directory"
        aria-label="mDrive workspace files"
        onDragOver={(e) => {
          if (canUpload && e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (canUpload) files.addUploads(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="files-toolbar">
          <div className="files-tabs" role="group" aria-label="Directory">
            <button aria-pressed={!trash} onClick={() => changeView("files")}>
              All files
            </button>
            <button aria-pressed={trash} onClick={() => changeView("trash")}>
              <FileIcon kind="trash" />
              Trash
            </button>
          </div>
          <div className="files-toolbar-controls">
            <input
              aria-label="Search workspace files and folders"
              placeholder="Search this workspace…"
              value={files.search}
              onChange={(e) => files.setSearch(e.target.value)}
            />
            <select
              aria-label="File type"
              value={query.type}
              onChange={(e) =>
                files.setQuery({
                  ...query,
                  type:
                    e.target.value === "images"
                      ? "images"
                      : e.target.value === "pdf"
                        ? "pdf"
                        : "all",
                  page: 1,
                })
              }
            >
              <option value="all">All types</option>
              <option value="images">Images</option>
              <option value="pdf">PDFs</option>
            </select>
            <select
              aria-label="Sort files"
              value={query.sort}
              onChange={(e) => {
                const sort: FileQuery["sort"] =
                  e.target.value === "oldest"
                    ? "oldest"
                    : e.target.value === "name"
                      ? "name"
                      : e.target.value === "largest"
                        ? "largest"
                        : "newest";
                files.setQuery({ ...query, sort, page: 1 });
              }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="largest">Largest first</option>
            </select>
          </div>
        </div>
        <div className="files-path-row">
          <nav aria-label="Folder breadcrumb">
            <button onClick={() => files.navigate(null)}>{trash ? "Trash" : "All files"}</button>
            {breadcrumbs(folders, query.folder_id ?? null).map((folder) => (
              <span key={folder.id}>
                <span aria-hidden="true">/</span>
                <button onClick={() => files.navigate(folder.id)}>{folder.name}</button>
              </span>
            ))}
          </nav>
          <div className="files-layout" role="group" aria-label="File display">
            <button aria-pressed={layout === "list"} onClick={() => setLayout("list")}>
              List
            </button>
            <button aria-pressed={layout === "grid"} onClick={() => setLayout("grid")}>
              Grid
            </button>
            <button aria-label="Refresh files" onClick={files.refresh} disabled={files.loading}>
              ↻
            </button>
          </div>
        </div>
        {files.error && !dialog && (
          <div className="files-error">
            <ErrorBanner message={files.error.message} />
            <button className="btn-base btn-ghost" onClick={files.refresh}>
              Refresh files
            </button>
          </div>
        )}
        {data && !data.storage_configured && (
          <p className="files-notice">
            Uploads are unavailable because file storage is not configured.
          </p>
        )}
        {trash && (
          <p className="files-notice">
            Items are kept for {data?.trash_days ?? 30} days. Trash still uses storage. Only the
            workspace owner can permanently delete items.
          </p>
        )}
        <div aria-busy={files.loading}>
          {files.loading ? (
            <p className="files-loading" role="status">
              Loading files…
            </p>
          ) : !data ? (
            <div className="files-empty">
              <FileIcon kind="folder" />
              <h2>Your files could not be loaded</h2>
              <button className="btn-base btn-ghost" onClick={files.refresh}>
                Try again
              </button>
            </div>
          ) : (
            <>
              {children.length > 0 && (
                <div className="files-folders">
                  {children.map((folder) => (
                    <article className="files-folder" key={folder.id}>
                      <button
                        className="files-folder-open"
                        onClick={() => files.navigate(folder.id)}
                      >
                        <FileIcon kind="folder" />
                        <span>
                          {folder.name}
                          <small>Created by {folder.creator_name}</small>
                        </span>
                      </button>
                      <ItemActions
                        item={{ ...folder, kind: "folders" }}
                        owner={data.role === "owner"}
                        onAction={openDialog}
                      />
                    </article>
                  ))}
                </div>
              )}
              {data.files.length > 0 ? (
                <div className={`files-items files-${layout}`}>
                  {layout === "list" && (
                    <div className="files-column-labels">
                      <span>Name</span>
                      <span>Added by</span>
                      <span>Size</span>
                      <span>Date</span>
                      <span />
                    </div>
                  )}
                  {data.files.map((file) => (
                    <article className="files-item" key={file.id}>
                      <button
                        className="files-open"
                        onClick={() => setPreview(file)}
                        disabled={trash}
                      >
                        {layout === "grid" && file.content_type.startsWith("image/") && !trash ? (
                          <Image
                            unoptimized
                            width={1200}
                            height={900}
                            src={api.workspaceFileUrl(teamId, file.id, "preview")}
                            alt=""
                            loading="lazy"
                          />
                        ) : (
                          <span className="files-type-icon">
                            <FileIcon
                              kind={file.content_type.startsWith("image/") ? "image" : "file"}
                            />
                          </span>
                        )}
                        <span className="files-name">
                          {file.name}
                          <small>
                            {file.content_type === "application/pdf" ? "PDF document" : "Image"}
                          </small>
                        </span>
                      </button>
                      <span className="files-uploader">{file.uploader_name}</span>
                      <span className="files-size">{formatBytes(file.size_bytes)}</span>
                      <time className="files-date" dateTime={file.created_at}>
                        {new Date(file.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </time>
                      <ItemActions
                        item={{ ...file, kind: "files" }}
                        owner={data.role === "owner"}
                        onAction={openDialog}
                        downloadUrl={
                          !trash ? api.workspaceFileUrl(teamId, file.id, "download") : undefined
                        }
                      />
                    </article>
                  ))}
                </div>
              ) : (
                children.length === 0 && (
                  <div className="files-empty">
                    <FileIcon kind={trash ? "trash" : "folder"} />
                    <h2>
                      {files.search || query.type !== "all"
                        ? "No matching files"
                        : trash
                          ? "Trash is empty"
                          : "A place for the work you share"}
                    </h2>
                    <p>
                      {files.search || query.type !== "all"
                        ? "Try another search or file type."
                        : trash
                          ? "Deleted files and folders will appear here."
                          : "Drop images and PDFs here, or create a folder to get started."}
                    </p>
                    {canUpload && (
                      <button className="btn-base btn-ghost" onClick={() => input.current?.click()}>
                        Choose files
                      </button>
                    )}
                  </div>
                )
              )}
              <div className="files-pagination">
                <span>
                  {data.total} {data.total === 1 ? "file" : "files"}
                  {children.length > 0 ? ` · ${children.length} folders` : ""}
                </span>
                <div>
                  <button
                    disabled={data.page <= 1}
                    onClick={() => files.setQuery({ ...query, page: data.page - 1 })}
                  >
                    Previous
                  </button>
                  <span>
                    Page {data.page} of {Math.max(1, Math.ceil(data.total / data.page_size))}
                  </span>
                  <button
                    disabled={data.page * data.page_size >= data.total}
                    onClick={() => files.setQuery({ ...query, page: data.page + 1 })}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
      {files.uploads.length > 0 && (
        <section className="files-uploads" aria-label="Upload progress">
          <header>
            <h2>Uploads</h2>
            <button className="btn-base btn-ghost" onClick={files.clearCompleted}>
              Clear completed
            </button>
          </header>
          {files.uploads.map((upload) => (
            <div key={upload.id} className="files-upload">
              <FileIcon />
              <div>
                <span>{upload.file.name}</span>
                <small role="status">
                  {upload.error ??
                    (upload.status === "done"
                      ? "Uploaded"
                      : upload.status === "queued"
                        ? "Waiting to upload…"
                        : upload.status === "processing"
                          ? "Saving file…"
                          : `${Math.round(upload.progress * 100)}%`)}
                </small>
                {upload.status === "uploading" && (
                  <progress
                    value={upload.progress}
                    max={1}
                    aria-label={`Uploading ${upload.file.name}`}
                  />
                )}
              </div>
              {upload.status === "failed" ? (
                <button className="btn-base btn-ghost" onClick={() => void files.retry(upload)}>
                  Retry
                </button>
              ) : (
                <span className="files-muted">{formatBytes(upload.file.size)}</span>
              )}
            </div>
          ))}
        </section>
      )}
      <AnimatePresence>
        {dialog && (
          <FileDialog
            key={`${dialog.action}-${"item" in dialog ? dialog.item.id : "new"}`}
            dialog={dialog}
            folders={folders}
            busy={files.busy}
            error={files.error?.message}
            onSubmit={(value) => files.act(dialog, value)}
            onClose={() => {
              setDialog(null);
              files.clearError();
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {preview && (
          <FilePreview
            key={preview.id}
            file={preview}
            teamId={teamId}
            onClose={() => setPreview(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
function ItemActions({
  item,
  owner,
  onAction,
  downloadUrl,
}: {
  item: FileItem;
  owner: boolean;
  onAction: (dialog: Dialog) => void;
  downloadUrl?: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  if (!item.can_manage && !downloadUrl && !(owner && item.trashed_at)) return null;
  const action = (type: Exclude<Dialog["action"], "create">) => {
    if (menu.current) menu.current.open = false;
    onAction({ action: type, item });
  };
  return (
    <details
      className="files-menu"
      ref={menu}
      onKeyDown={(e) => {
        if (e.key === "Escape" && menu.current) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`Actions for ${item.name}`}>···</summary>
      <div>
        {downloadUrl && <a href={downloadUrl}>Download</a>}
        {item.can_manage &&
          (item.trashed_at ? (
            <button onClick={() => action("restore")}>Restore</button>
          ) : (
            <>
              <button onClick={() => action("rename")}>Rename</button>
              <button onClick={() => action("move")}>Move to folder</button>
              <button className="files-danger-text" onClick={() => action("trash")}>
                Move to Trash
              </button>
            </>
          ))}
        {owner && item.trashed_at && (
          <button className="files-danger-text" onClick={() => action("delete")}>
            Delete permanently
          </button>
        )}
      </div>
    </details>
  );
}
