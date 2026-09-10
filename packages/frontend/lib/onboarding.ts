import type { TourState } from "./api";
import type { CardSide } from "./tour-geometry";

// PRD-13: the guided walkthrough — its content, its one visibility rule, and the
// little engine that walks it. Pure data and pure functions (no React, no DOM)
// so every decision it makes can be truth-tabled in a one-shot tsx script
// instead of only in a browser.
//
// Second pass (2026-09-09, owner ask): what began as five static coach marks is
// now a walkthrough with three kinds of step. A LOOK step frames a control and
// advances on Next. An ACT step leaves the highlighted control live — the user
// is meant to use it. A WAIT step holds until the app itself reports the action
// happened (the form opened, the task was created, a task was opened) and then
// advances by itself; its card offers "Skip step" instead of "Next", so no step
// can ever trap anyone. Only ever REQUIRED: opening the form, submitting it, and
// clicking a task. Never required, only shown: attaching files, writing a
// description, adding steps, posting a comment (the owner's explicit rule —
// "don't ask the user to add an image, just show that we can").

/** The tour only ever coaches the board. */
export const TOUR_PATHNAME = "/tasks";

/** Below this the sidebar is a slide-in drawer, so the sidebar targets do not
 * exist. The tour stays quiet and leaves `tour_state` NULL — which is the point
 * of storing the flag server-side: it still runs on their first desktop visit.
 * Matches AppShell's `max-[800px]` breakpoint. */
export const TOUR_MIN_WIDTH = 800;

/** The `data-tour` contract. Every id here must exist somewhere in the source
 * (the verification harness greps for it), and the ones a component renders
 * conditionally are allowed to be absent at runtime — a missing target skips its
 * step rather than throwing. */
export type TourTargetId =
  | "container-switcher"
  | "create-task"
  | "task-row"
  | "board-controls"
  | "notifications-bell"
  | "nav-team"
  // the new-task form
  | "task-fields"
  | "task-chips"
  | "task-more"
  | "task-steps"
  | "task-attach"
  | "task-submit"
  // inside the task drawer
  | "drawer-title"
  | "drawer-description"
  | "drawer-checklist"
  | "drawer-files"
  | "drawer-chips"
  | "drawer-more"
  | "drawer-composer"
  | "drawer-footer";

/** The slice of app state the walkthrough reasons about. Everything here is
 * state the tasks page already owns — no new fetch, no lifted comment state. */
export type TourProgress = {
  /** Tasks in the current container. */
  taskCount: number;
  /** The new-task form is open. */
  modalOpen: boolean;
  /** A task's drawer is open. */
  taskOpen: boolean;
};

/** The app events a WAIT step can gate on. */
export type TourWait = "modal-open" | "task-created" | "task-opened";

export type TourStep = {
  /** Stable id — the dots/counter key and the harness's per-step assertions. */
  id: string;
  target: TourTargetId;
  title: string;
  body: string;
  /** Preferred side for the coach card; `cardPosition` flips it when the card
   * would leave the viewport. */
  side: CardSide;
  /** true = the highlighted control stays live (the scrim leaves its hole
   * clickable). Defaults to false: frame it, dim the rest. */
  act?: boolean;
  /** Present on a WAIT step: the card shows "Skip step" instead of "Next" and
   * the walkthrough advances itself when the app reports this happened. */
  waitFor?: TourWait;
  /** A step whose moment has passed is skipped, never shown: the form steps
   * only exist while the form is open, the drawer steps only while a drawer is.
   * This is what makes the walkthrough resumable without a step column — a user
   * who abandoned mid-way restarts at the first step that still applies. */
  when?: (p: TourProgress) => boolean;
};

/** Selector for a step's target. Kept here so the attribute name lives in one
 * file instead of being retyped at every call site. */
export const tourTargetSelector = (id: TourTargetId): string => `[data-tour="${id}"]`;

/** The primary button's label on the final step. */
export const TOUR_FINISH_LABEL = "Start using Mokara";

// Copy rules (docs/design/onboarding-guide-mockup.html §04): name the control by
// its on-screen label in its real casing, say what happens rather than how to
// feel, state a limit in the same sentence as the feature, and never name a
// control that does nothing — the breadcrumb star, the filter-settings gear, the
// funnel, the layout button and the modal's expand button all render with no
// handler, so none of them is a target or a word here.
//
// `create-task` carries the id on THREE mutually exclusive nodes (empty-state
// CTA, filtered-empty CTA, Todo header "+"), because a fresh account renders no
// group headers at all and an all-done board under the default `active` filter
// renders no Todo `+`. The same trick lets one selector serve two steps: a fresh
// account gets the WAIT step (the walkthrough invites the click), anyone with
// tasks already gets the narrative one.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "switcher",
    target: "container-switcher",
    title: "This is your workspace",
    body: "Everything on the board belongs to the container named here. A workspace is private to you; a team is shared — and a workspace becomes a team the moment someone accepts an invite.",
    side: "right",
  },
  {
    id: "create-empty",
    target: "create-task",
    title: "Add your first task",
    body: "This button opens the new-task form. A title is the only required field — everything else on it is optional. Click it when you are ready, and the walkthrough follows you in.",
    side: "bottom",
    act: true,
    waitFor: "modal-open",
    when: (p) => p.taskCount === 0,
  },
  {
    id: "create-any",
    target: "create-task",
    title: "The only way in",
    body: "This + is the board's only create button, so it lives on the Todo header and can never disappear. The form it opens is the next part of the walkthrough — carry on there, or step past it.",
    side: "bottom",
    when: (p) => p.taskCount > 0,
  },
  {
    id: "form-fields",
    target: "task-fields",
    title: "Name it",
    body: "The title is the only required field; the description under it is free text and newlines survive. Both stay editable from the task later, so nothing here is final.",
    side: "bottom",
    act: true,
    when: (p) => p.modalOpen,
  },
  {
    id: "form-chips",
    target: "task-chips",
    title: "Set its shape",
    body: "Status, priority, due date and assignee on one line. Clicking the priority bars cycles low, medium, high; the date chip offers Today and +7 days. All optional.",
    side: "bottom",
    act: true,
    when: (p) => p.modalOpen,
  },
  {
    id: "form-more",
    target: "task-more",
    title: "Weigh it",
    body: "Project and KPIs fold in here. A KPI is personal — you can only weigh a task toward one of your own — and one task's weights are capped at 100%.",
    side: "bottom",
    act: true,
    when: (p) => p.modalOpen,
  },
  {
    id: "form-steps",
    target: "task-steps",
    title: "Break it into steps",
    body: "Type and press Enter for each one; they become the task's Checklist. Steps can only be added here, at creation — later you can tick, rename and reorder them, but not add.",
    side: "bottom",
    act: true,
    when: (p) => p.modalOpen,
  },
  {
    id: "form-attach",
    target: "task-attach",
    title: "Files ride along",
    body: "Images and PDFs can be attached at creation. This walkthrough will not ask you to — and the same paperclip lives on every comment, for files that come later.",
    side: "left",
    when: (p) => p.modalOpen,
  },
  {
    id: "form-submit",
    target: "task-submit",
    title: "Create it",
    body: "Click Create task when it reads right. Steps and files you added come with it; the walkthrough continues on the board, then inside the task itself.",
    side: "left",
    act: true,
    waitFor: "task-created",
    when: (p) => p.modalOpen,
  },
  {
    id: "open-task",
    target: "task-row",
    title: "Open it",
    body: "Click the row you just made. Everything you set lives in the panel that slides out — and the same is true of any row, any time.",
    side: "bottom",
    act: true,
    waitFor: "task-opened",
    when: (p) => p.taskCount > 0 && !p.modalOpen,
  },
  {
    id: "drawer-title",
    target: "drawer-title",
    title: "The title, and its id",
    body: "Double-click to rename — Enter saves, Esc cancels. The short id beside Task in the top bar is the same one the row carries.",
    side: "left",
    act: true,
    when: (p) => p.taskOpen,
  },
  {
    id: "drawer-description",
    target: "drawer-description",
    title: "Description",
    body: "Click to edit; Enter saves and Shift+Enter is a newline, Esc reverts. Clearing it removes the description — an empty one is a normal state here, not a warning.",
    side: "left",
    act: true,
    when: (p) => p.taskOpen,
  },
  {
    id: "drawer-chips",
    target: "drawer-chips",
    title: "Change its state",
    body: "The same four chips as the form, live now: status, priority, due date, assignee. Assigning someone notifies them; a due date inside 48 hours turns up in the bell, red once it is overdue.",
    side: "left",
    act: true,
    when: (p) => p.taskOpen,
  },
  {
    id: "drawer-more",
    target: "drawer-more",
    title: "Project, KPIs, flag",
    body: "The same panel as the form, plus one more: Flag marks a task for attention without touching its status.",
    side: "left",
    act: true,
    when: (p) => p.taskOpen,
  },
  {
    id: "drawer-checklist",
    target: "drawer-checklist",
    title: "Checklist",
    body: "The steps you wrote at creation, tickable and reorderable; double-click renames, same as the title. You are seeing this because the task has steps — tasks without any just hide the section.",
    side: "left",
    act: true,
    when: (p) => p.taskOpen,
  },
  {
    id: "drawer-files",
    target: "drawer-files",
    title: "Files",
    body: "Thumbnails for images, a download pill for PDFs. Only the person who uploaded a file can remove it, and deleting the task takes its files with it.",
    side: "left",
    when: (p) => p.taskOpen,
  },
  {
    id: "drawer-composer",
    target: "drawer-composer",
    title: "Comments",
    body: "Type and press ⌘+Enter — a plain Enter is a newline. The paperclip takes images and PDFs, and this walkthrough will not ask you to attach anything. Replies go one level deep; edit and delete are yours alone.",
    side: "left",
    act: true,
    when: (p) => p.taskOpen,
  },
  {
    id: "drawer-footer",
    target: "drawer-footer",
    title: "Closing, and deleting",
    body: "Esc closes the panel. Delete lives down here too — and it does not ask twice, so the walkthrough keeps it out of reach while it is up.",
    side: "left",
    when: (p) => p.taskOpen,
  },
  {
    id: "board-controls",
    target: "board-controls",
    title: "Narrow the board",
    body: "Active, Today, This week and Done choose what is on screen. The dropdown at the other end of this row sorts by Manual, Priority or Due date. Both keep their value as you move around the app.",
    side: "bottom",
    act: true,
    when: (p) => !p.modalOpen,
  },
  {
    id: "bell",
    target: "notifications-bell",
    title: "Invitations and deadlines land here",
    body: "Teammates invite you by @username — Accept sits right on the row. Tasks due within 48 hours turn up here too, red once they are overdue.",
    side: "left",
    when: (p) => !p.modalOpen,
  },
  {
    id: "nav-team",
    target: "nav-team",
    title: "Projects, KPIs and people",
    body: "The Team page is where projects and KPIs are created, and where you invite people. Tasks borrow them from the … panel you just saw.",
    side: "right",
    when: (p) => !p.modalOpen,
  },
];

// ---- the engine -------------------------------------------------------------

/** Does the app state this WAIT step waits for already hold? */
export function waitSatisfied(step: TourStep, p: TourProgress): boolean {
  switch (step.waitFor) {
    case "modal-open":
      return p.modalOpen;
    case "task-created":
      // The form closed AND a task now exists — creating without submitting
      // (Cancel) does not satisfy it, and neither does a modal that is still up.
      return !p.modalOpen && p.taskCount > 0;
    case "task-opened":
      return p.taskOpen;
    default:
      // A LOOK step: nothing to wait for, never auto-advances.
      return false;
  }
}

/** A step whose moment has passed is skipped, never shown. */
export function stepVisible(step: TourStep, p: TourProgress): boolean {
  return step.when === undefined || step.when(p);
}

/** Where the walkthrough starts. -1 means nothing applies right now. */
export function firstVisibleIndex(steps: TourStep[], p: TourProgress): number {
  for (let i = 0; i < steps.length; i += 1) {
    if (stepVisible(steps[i], p)) return i;
  }
  return -1;
}

/** The next applicable step after `from`. -1 means the walkthrough is over. */
export function nextVisibleIndex(steps: TourStep[], from: number, p: TourProgress): number {
  for (let i = from + 1; i < steps.length; i += 1) {
    if (stepVisible(steps[i], p)) return i;
  }
  return -1;
}

/** The previous applicable step, for Back. -1 means there is none. */
export function prevVisibleIndex(steps: TourStep[], from: number, p: TourProgress): number {
  for (let i = from - 1; i >= 0; i -= 1) {
    if (stepVisible(steps[i], p)) return i;
  }
  return -1;
}

/** The walkthrough's end is the array's LAST step — never "no next step is
 * visible right now".
 *
 * That distinction is the whole fix for the owner's flow bug (2026-09-09): at
 * form-submit the form is open and no task exists, so every later phase is
 * gated off IN THAT SNAPSHOT and the old snapshot-based check handed the finish
 * label ("Start using Mokara") to step 9 of 21 — and its exhaustion rule then
 * wrote `completed`, skipping the entire second half. The remaining phases are
 * not gone, they are waiting on the user; only the array's last step may end
 * the walkthrough by button. */
export function atWalkthroughEnd(steps: TourStep[], index: number): boolean {
  return index === steps.length - 1;
}

/** Everything the visibility rule needs, and nothing it doesn't. Deliberately
 * plain values — no session object, no DOM — so this stays testable. */
export type TourGate = {
  /** The session probe resolved and the user is signed in. */
  authed: boolean;
  /** `users.tour_state`. `null` is the only value that means "run it". */
  tourState: TourState | null | undefined;
  pathname: string;
  /** The board finished loading — never coach over a spinner, and never coach
   * over a failed load. */
  boardReady: boolean;
  viewportWidth: number;
  /** Dismissed in this tab. Covers the moment between the click and the
   * session atom catching up, and a write that never landed. */
  dismissed: boolean;
};

/** The whole feature in one predicate (PRD-13 §2).
 *
 * `undefined` fails CLOSED: it means the server did not send the field at all —
 * a frontend deployed ahead of its backend. Reading that as "never resolved"
 * would show a tour that cannot be dismissed (its PATCH would 404 too), so an
 * unknown field means "do not run". Only an explicit `null` from a server that
 * knows the column arms the tour. */
export function shouldRunTour(gate: TourGate): boolean {
  return (
    gate.authed &&
    !gate.dismissed &&
    gate.tourState === null &&
    gate.pathname === TOUR_PATHNAME &&
    gate.boardReady &&
    gate.viewportWidth >= TOUR_MIN_WIDTH
  );
}
