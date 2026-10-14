import type { WorkspaceFolder, FileQuery } from "@/lib/api-types";
export type FileItem = {
  kind: "files" | "folders";
  id: string;
  name: string;
  can_manage: boolean;
  trashed_at: string | null;
};
export type FileDialog =
  | { action: "create" }
  | { action: "rename" | "move" | "trash" | "restore" | "delete"; item: FileItem };
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(unit === 1 ? 0 : 1)} ${["B", "KB", "MB", "GB"][unit]}`;
}
export function breadcrumbs(folders: WorkspaceFolder[], id: string | null) {
  const result: WorkspaceFolder[] = [],
    seen = new Set<string>();
  while (id && !seen.has(id)) {
    const folder = folders.find((f) => f.id === id);
    if (!folder) break;
    result.unshift(folder);
    seen.add(id);
    id = folder.parent_id;
  }
  return result;
}
export function visibleFolders(folders: WorkspaceFolder[], query: FileQuery) {
  const trash = query.view === "trash";
  if (query.type && query.type !== "all") return [];
  const result = folders.filter(
    (f) =>
      Boolean(f.trashed_at) === trash &&
      (query.q
        ? f.name.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())
        : query.folder_id
          ? f.parent_id === query.folder_id
          : !f.parent_id || (trash && !folders.find((p) => p.id === f.parent_id)?.trashed_at))
  );
  return result.sort((a, b) =>
    query.sort === "newest"
      ? b.created_at.localeCompare(a.created_at)
      : query.sort === "oldest"
        ? a.created_at.localeCompare(b.created_at)
        : a.name.localeCompare(b.name)
  );
}
export function moveDestinations(folders: WorkspaceFolder[], item: FileItem | null) {
  return folders.filter(
    (f) =>
      !f.trashed_at &&
      (item?.kind !== "folders" || !breadcrumbs(folders, f.id).some((p) => p.id === item.id))
  );
}
