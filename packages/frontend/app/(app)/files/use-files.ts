"use client";
import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { FileList, FileQuery } from "@/lib/api-types";
import { useAsyncError } from "@/hooks/useAsyncError";
import type { FileDialog } from "./file-model";
export type Upload = {
  id: string;
  file: File;
  folderId: string | null;
  progress: number;
  status: "queued" | "uploading" | "processing" | "done" | "failed";
  error?: string;
};
export function useFiles(teamId: string) {
  const [data, setData] = useState<FileList | null>(null);
  const [query, setQuery] = useState<FileQuery>({
    view: "files",
    type: "all",
    sort: "newest",
    page: 1,
  });
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [revision, setRevision] = useState(0);
  const [dataKey, setDataKey] = useState("");
  const activeUploads = useRef(new Set<string>());
  const [loadedKey, setLoadedKey] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const { error, run, clearError } = useAsyncError();
  const directoryKey = JSON.stringify([query, deferredSearch]);
  const key = JSON.stringify([directoryKey, revision]);
  // Synchronize the workspace's remote directory with navigation/search. Rendering
  // cannot perform this read; abort obsolete snapshots before they reach state.
  useEffect(() => {
    const controller = new AbortController();
    void run(() => api.listFiles(teamId, { ...query, q: deferredSearch }, controller.signal), {
      signal: controller.signal,
      loginFrom: "/files",
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result) {
        setData(result);
        setDataKey(directoryKey);
      }
      setLoadedKey(key);
    });
    return () => controller.abort();
  }, [teamId, query, deferredSearch, revision, key, directoryKey, run]);
  // XMLHttpRequest uploads outlive events; the workspace mount owns their
  // cancellation so a switch cannot update another workspace's queue.
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const navigate = (folderId: string | null) => {
    setSearch("");
    setQuery((q) => ({ ...q, folder_id: folderId ?? undefined, page: 1 }));
    clearError();
  };
  const upload = async (entry: Upload) => {
    if (activeUploads.current.has(entry.id)) return;
    activeUploads.current.add(entry.id);
    const signal = lifetime.current?.signal;
    const update = (patch: Partial<Upload>) => {
      if (!signal?.aborted)
        setUploads((rows) => rows.map((r) => (r.id === entry.id ? { ...r, ...patch } : r)));
    };
    update({ status: "uploading", progress: 0, error: undefined });
    const result = await run(
      () =>
        api.uploadWorkspaceFile(
          teamId,
          entry.folderId,
          entry.id,
          entry.file,
          (fraction) =>
            update({ progress: fraction, status: fraction >= 1 ? "processing" : "uploading" }),
          signal
        ),
      {
        signal,
        loginFrom: "/files",
        onError: (failure) => update({ status: "failed", error: failure.message }),
      }
    );
    activeUploads.current.delete(entry.id);
    if (result) {
      update({ progress: 1, status: "done" });
      refresh();
    }
  };
  const addUploads = (files: File[]) => {
    const entries: Upload[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      folderId: query.folder_id ?? null,
      progress: 0,
      status: "queued",
    }));
    setUploads((rows) => [...rows, ...entries]);
    // Sequential per selection keeps progress predictable and avoids buffering
    // a whole directory's files on the API server at once.
    void (async () => {
      for (const entry of entries) {
        if (lifetime.current?.signal.aborted) break;
        await upload(entry);
      }
    })();
  };
  const act = async (dialog: FileDialog, value: string) => {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    clearError();
    try {
      const result = await run(
        async () => {
          if (dialog.action === "create")
            return api.createFolder(teamId, value.trim(), query.folder_id ?? null);
          const { item } = dialog;
          if (dialog.action === "rename")
            return item.kind === "files"
              ? api.updateFile(teamId, item.id, { name: value.trim() })
              : api.updateFolder(teamId, item.id, { name: value.trim() });
          if (dialog.action === "move")
            return item.kind === "files"
              ? api.updateFile(teamId, item.id, { folder_id: value || null })
              : api.updateFolder(teamId, item.id, { parent_id: value || null });
          return api.manageFileItem(teamId, item.kind, item.id, dialog.action);
        },
        { signal: lifetime.current?.signal, loginFrom: "/files" }
      );
      if (!result) return false;
      refresh();
      return true;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return {
    data: dataKey === directoryKey ? data : null,
    query,
    setQuery,
    search,
    setSearch: (value: string) => {
      setSearch(value);
      setQuery((q) => ({ ...q, page: 1 }));
    },
    loading: loadedKey !== key,
    error,
    clearError,
    refresh,
    navigate,
    uploads,
    addUploads,
    retry: upload,
    clearCompleted: () => setUploads((rows) => rows.filter((r) => r.status !== "done")),
    busy,
    act,
  };
}
