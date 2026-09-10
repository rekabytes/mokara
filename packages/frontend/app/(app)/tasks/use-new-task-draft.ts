"use client";

// The create-task draft: every field of NewTaskModal, the modal's open flag, the
// in-flight guard, and the four handlers that drive them.
//
// WHY THIS IS A HOOK AND NOT A COMPONENT: the twelve `useState` calls must run
// in the SAME ORDER, at the SAME POSITION in `TasksPage`'s render, as they did
// when they were written out inline. So the call site sits exactly where
// `const [modalOpen, setModalOpen] = useState(false)` used to, and this body
// contains those twelve `useState` calls and NOTHING else — no `useCallback`,
// no `useMemo`, no `useEffect`. The handlers stay plain functions declared in
// the body, as they were. `/tmp/mokara-verify/hooks.mjs` asserts the flattened
// sequence matches the baseline; breaking that rule is how a refactor like this
// earns "Rendered more hooks than during the previous render".
//
// `openModal` deliberately does NOT clear `newSubtasks`/`newFiles` while
// `resetAndCloseModal` does — that asymmetry is pre-existing behaviour and is
// preserved verbatim, not "fixed" here.
//
// `run`'s type is DERIVED from `useAsyncError` rather than restated, so the two
// can never drift and no cast is needed.

import { useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
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
  const [creating, setCreating] = useState(false);

  async function createTaskFromModal(e: React.FormEvent) {
    // The submit button is a real <button type="submit"> inside a real <form>;
    // without preventDefault the browser navigates to /tasks?… the moment the
    // synchronous part of this handler finishes and aborts the upload chain
    // (createTask succeeds → row on board, but file uploads never run).
    e.preventDefault();
    if (!teamId) return;
    const title = newTitle.trim();
    if (!title || creating) return;
    setCreating(true);
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
    if (!created) {
      setCreating(false);
      return;
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

    // The created row predates its own steps/files — refetch so the board and
    // the drawer start from the complete payload.
    const fresh = await run(() => api.getTask(created.id), {
      fallback: "Failed to load the new task",
    });
    setCreating(false);
    // Only close the modal and add to the board when the refetch succeeds.
    // On failure the error stays visible and the user can retry.
    if (!fresh) return;
    setTasks((prev) => [fresh, ...prev]);
    resetAndCloseModal();
  }

  function openModal() {
    setNewTitle("");
    setNewDescription("");
    setNewPriority("medium");
    setNewStatus("todo");
    setNewDueDate(null);
    setNewProjectId(null);
    setNewKpis([]);
    setNewAssigneeId(null);
    setModalOpen(true);
  }

  function resetAndCloseModal() {
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
    creating,
    createTaskFromModal,
    openModal,
    resetAndCloseModal,
    onModalKey,
  };
}
