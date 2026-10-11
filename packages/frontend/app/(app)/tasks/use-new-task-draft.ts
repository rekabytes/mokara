"use client";

// The create-task draft: every field of NewTaskModal, the modal's open flag, the
// in-flight guard, and the four handlers that drive them.
//
// The draft stays local to the tasks page. The ref guard closes the interval
// before React renders `creating`, and the workspace identity prevents a late
// result from writing into a different board. No effect mirrors draft fields.
//
// `openModal` deliberately does NOT clear `newSubtasks`/`newFiles` while
// `resetAndCloseModal` does — that asymmetry is pre-existing behaviour and is
// preserved verbatim, not "fixed" here.
//
// `run`'s type is DERIVED from `useAsyncError` rather than restated, so the two
// can never drift and no cast is needed.

import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { api, type BindingDraft, type Task, type TaskPriority, type TaskStatus } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";

type Run = ReturnType<typeof useAsyncError>["run"];

export function useNewTaskDraft({
  teamId,
  run,
  setTasks,
}: {
  teamId: string | null;
  run: Run;
  setTasks: Dispatch<SetStateAction<Task[]>>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [newStatus, setNewStatus] = useState<TaskStatus>("todo");
  const [newDueDate, setNewDueDate] = useState<string | null>(null);
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [newKpis, setNewKpis] = useState<BindingDraft[]>([]);
  // PRD-10: assignee at creation.
  const [newAssigneeId, setNewAssigneeId] = useState<string | null>(null);
  // PRD-11: steps and files are CREATION-TIME features — they are drafted here
  // and uploaded right after the task exists (two-phase, like comments).
  const [newSubtasks, setNewSubtasks] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [publishToGitHub, setPublishToGitHub] = useState(false);
  const [githubRepositoryId, setGitHubRepositoryId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const pending = useRef(false);
  const context = useMemo(() => ({ teamId }), [teamId]);
  const currentContext = useRef(context);
  currentContext.current = context;

  async function createTaskFromModal(e: React.FormEvent) {
    // The submit button is a real <button type="submit"> inside a real <form>;
    // without preventDefault the browser navigates to /tasks?… the moment the
    // synchronous part of this handler finishes and aborts the upload chain
    // (createTask succeeds → row on board, but file uploads never run).
    e.preventDefault();
    if (!teamId) return;
    const title = newTitle.trim();
    if (!title || pending.current) return;
    pending.current = true;
    setCreating(true);
    try {
      const created = await run(
        () =>
          api.createTeamTask(teamId, {
            title,
            description: newDescription.trim() || undefined,
            priority: newPriority,
            status: newStatus,
            due_date: newDueDate ?? undefined,
            project_id: newProjectId ?? undefined,
            assignee_id: newAssigneeId ?? undefined,
            kpis: newKpis.length ? newKpis : undefined,
          }),
        { fallback: "Failed to create task" }
      );
      if (!created) return;
      // Creation succeeded. A later upload or refresh failure must never turn
      // this submit button into a second POST for the same task.
      if (currentContext.current === context) {
        setTasks((previous) =>
          previous.some((task) => task.id === created.id) ? previous : [created, ...previous]
        );
      }

      // PRD-11: steps upload first (sequential appends land at positions 0..n-1),
      // then files — image and PDF only, enforced by the route.
      for (const step of newSubtasks) {
        await run(() => api.createSubtask(created.id, step), {
          fallback: "Failed to add a step",
        });
      }
      for (const file of newFiles) {
        await run(() => api.uploadAttachment(created.id, file), {
          fallback: "Failed to attach the file",
        });
      }
      // GitHub is a second, non-atomic side effect. A failure leaves the Mokara
      // task intact and stores a retryable failed link on it; the refetch below
      // brings that state into the drawer.
      if (publishToGitHub && githubRepositoryId) {
        await run(() => api.publishGitHubIssue(created.id, githubRepositoryId), {
          fallback: "Task created, but the GitHub issue could not be created.",
        });
      }

      // The created row predates its own steps/files — refetch so the board and
      // the drawer start from the complete payload.
      const fresh = await run(() => api.getTask(created.id), {
        fallback: "Failed to load the new task",
      });
      // A failed refresh does not undo creation. Keep its known row and show
      // the shared error on the board; retrying creation would make a duplicate.
      if (currentContext.current !== context) return;
      const completed = fresh ?? created;
      // Upsert, not prepend: the task's own SSE echo (task_created publishes to
      // the actor's channel too) usually lands DURING the step/file uploads above,
      // and an unconditional prepend raced it into a duplicate row — React's
      // "two children with the same key" error, hit through the walkthrough
      // (2026-09-10). The SSE handler already upserts by id, so this side
      // converges with it no matter which arrives first.
      setTasks((prev) =>
        prev.some((x) => x.id === completed.id)
          ? prev.map((x) =>
              x.id === completed.id &&
              fresh &&
              Date.parse(x.updated_at) <= Date.parse(fresh.updated_at)
                ? fresh
                : x
            )
          : [completed, ...prev]
      );
      // Release before closing so the user-facing close guard can stay strict.
      pending.current = false;
      resetAndCloseModal();
    } finally {
      pending.current = false;
      setCreating(false);
    }
  }

  function openModal() {
    if (pending.current) return;
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewStatus("todo");
    setNewDueDate(null);
    setNewProjectId(null);
    setNewKpis([]);
    setNewAssigneeId(null);
    setPublishToGitHub(false);
    setGitHubRepositoryId(null);
    setModalOpen(true);
  }

  function resetAndCloseModal() {
    if (pending.current) return;
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewStatus("todo");
    setNewDueDate(null);
    setNewProjectId(null);
    setNewKpis([]);
    setNewAssigneeId(null);
    setNewSubtasks([]);
    setNewFiles([]);
    setPublishToGitHub(false);
    setGitHubRepositoryId(null);
    setModalOpen(false);
  }

  function onModalKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      resetAndCloseModal();
    }
  }

  return {
    modalOpen,
    newTitle,
    setNewTitle,
    newDescription,
    setNewDescription,
    newPriority,
    setNewPriority,
    newStatus,
    setNewStatus,
    newDueDate,
    setNewDueDate,
    newProjectId,
    setNewProjectId,
    newKpis,
    setNewKpis,
    newAssigneeId,
    setNewAssigneeId,
    newSubtasks,
    setNewSubtasks,
    newFiles,
    setNewFiles,
    publishToGitHub,
    setPublishToGitHub,
    githubRepositoryId,
    setGitHubRepositoryId,
    creating,
    createTaskFromModal,
    openModal,
    resetAndCloseModal,
    onModalKey,
  };
}
