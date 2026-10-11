"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Comment, type User } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { restoreRemovedItems } from "./optimistic-list";

// One owner for request cancellation, optimistic rows and per-thread guards.
export function useTaskComments(taskId: string, currentUser: User | null) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const { error: loadError, run: runLoad, clearError: clearLoadError } = useAsyncError();
  const read = useRef<AbortController | null>(null);
  const { error: actionError, clearError: clearActionError, run } = useAsyncError();
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
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

  return {
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
  };
}
