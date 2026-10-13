"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type GitHubRepository } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";

// Personal repository eligibility is independent of the selected workspace.
export function useTaskRepositories() {
  const [githubRepositories, setGitHubRepositories] = useState<GitHubRepository[]>([]);

  const { error: githubError, run: runGitHub, clearError: clearGitHubError } = useAsyncError();
  const githubRead = useRef<AbortController | null>(null);
  const loadGitHub = useCallback(async () => {
    githubRead.current?.abort();
    const controller = new AbortController();
    githubRead.current = controller;
    clearGitHubError();
    const result = await runGitHub(() => api.getGitHubIntegration(controller.signal), {
      signal: controller.signal,
      fallback: "Couldn't load repositories for task creation.",
    });
    if (result)
      setGitHubRepositories(
        !result.configured || result.connection?.reauthorization_required
          ? []
          : (result.connection?.repositories.filter(
              (repository) => repository.enabled && repository.available
            ) ?? [])
      );
  }, [runGitHub, clearGitHubError]);
  // Personal integration is external server state, independent of workspace.
  // Failure stays visible and retryable without blocking ordinary task work.
  useEffect(() => {
    void loadGitHub();
    return () => githubRead.current?.abort();
  }, [loadGitHub]);

  return { githubRepositories, githubError, loadGitHub };
}
