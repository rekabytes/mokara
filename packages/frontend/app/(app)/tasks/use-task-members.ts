"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSetAtom } from "jotai";
import { api } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { containerMembersAtom } from "./board-model";

// Reuse the existing atom consumed by assignee controls; no second cache.
export function useTaskMembers(teamId: string | null) {
  const setContainerMembers = useSetAtom(containerMembersAtom);
  const { error: membersError, run: runMembers, clearError: clearMembersError } = useAsyncError();
  const membersRead = useRef<AbortController | null>(null);
  const loadMembers = useCallback(async () => {
    membersRead.current?.abort();
    const controller = new AbortController();
    membersRead.current = controller;
    clearMembersError();
    if (!teamId) return;
    const detail = await runMembers(() => api.getTeam(teamId, controller.signal), {
      signal: controller.signal,
      fallback: "Couldn't load workspace members.",
    });
    if (detail) setContainerMembers(detail.members);
  }, [teamId, setContainerMembers, runMembers, clearMembersError]);
  // Assignees are external membership data shared by both drawer chips.
  // Clear old workspace members immediately and cancel superseded reads.
  useEffect(() => {
    setContainerMembers([]);
    void loadMembers();
    return () => membersRead.current?.abort();
  }, [loadMembers, setContainerMembers]);

  return { membersError, loadMembers };
}
