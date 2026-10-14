import type { WorkspaceFolder, WorkspaceFile } from "@mokara/db/prisma/generated/client";

export const FILE_PAGE_SIZE = 40;
export const TRASH_DAYS = 30;
export const MAX_FOLDER_DEPTH = 20;
export const MAX_FOLDERS = 1000;
export const UPLOAD_LEASE_MS = 15 * 60_000;
export type FileDenial = {
  status: 400 | 403 | 404 | 409 | 416 | 503;
  error: string;
  message: string;
};
export const fileDenial = (
  error: string,
  message: string,
  status: FileDenial["status"] = 409
): FileDenial => ({ error, message, status });

export function descendants(
  folders: Pick<WorkspaceFolder, "id" | "parentId">[],
  id: string
): Set<string> {
  const result = new Set([id]);
  const children = new Map<string, string[]>();
  for (const folder of folders)
    if (folder.parentId)
      children.set(folder.parentId, [...(children.get(folder.parentId) ?? []), folder.id]);
  const pending = [id];
  while (pending.length)
    for (const child of children.get(pending.pop() ?? "") ?? [])
      if (!result.has(child)) {
        result.add(child);
        pending.push(child);
      }
  return result;
}

export function folderChain(
  folders: Pick<WorkspaceFolder, "id" | "parentId" | "name" | "trashedAt">[],
  id: string | null
) {
  const chain: typeof folders = [];
  const seen = new Set<string>();
  const map = new Map(folders.map((f) => [f.id, f]));
  while (id) {
    const folder = map.get(id);
    if (!folder || seen.has(id) || chain.length >= MAX_FOLDER_DEPTH) return null;
    chain.unshift(folder);
    seen.add(id);
    id = folder.parentId;
  }
  return chain;
}

export function validDestination(folders: WorkspaceFolder[], id: string | null): FileDenial | null {
  const chain = folderChain(folders, id);
  if (!chain || chain.some((f) => f.trashedAt))
    return fileDenial("file_folder_unavailable", "Choose an existing folder outside Trash.");
  return null;
}

export function canManage(createdBy: string | null, userId: string, role: string): boolean {
  return role === "owner" || createdBy === userId;
}
export function folderDto(folder: WorkspaceFolder, userId: string, role: string) {
  return {
    id: folder.id,
    parent_id: folder.parentId,
    name: folder.name,
    creator_name: folder.creatorName,
    created_at: folder.createdAt.toISOString(),
    trashed_at: folder.trashedAt?.toISOString() ?? null,
    can_manage: canManage(folder.createdById, userId, role),
  };
}
export function fileDto(file: WorkspaceFile, userId: string, role: string) {
  return {
    id: file.id,
    folder_id: file.folderId,
    name: file.name,
    uploader_name: file.uploaderName,
    size_bytes: file.sizeBytes,
    content_type: file.contentType,
    created_at: file.createdAt.toISOString(),
    trashed_at: file.trashedAt?.toISOString() ?? null,
    can_manage: canManage(file.uploadedById, userId, role),
  };
}

/** Only passive, recognized formats are previewable; SVG/HTML never enter this library. */
export function detectFileType(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString())) return "image/gif";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  if (b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}
export function safeLibraryFilename(raw: string): string {
  return (
    raw
      .split(/[/\\]/)
      .pop()
      ?.replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 200) || "File"
  );
}
export function downloadDisposition(name: string, inline = false): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(Buffer.from(name, "utf8").toString("utf8")).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
export function byteRange(
  raw: string | undefined,
  size: number
): { start: number; end: number } | null | "invalid" {
  if (!raw) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
  if (!match || (!match[1] && !match[2])) return "invalid";
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(size - 1, Number(match[2])) : size - 1) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    return "invalid";
  return { start, end };
}
