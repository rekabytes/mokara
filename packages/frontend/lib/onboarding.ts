import type { TourState } from "./api";
import type { CardSide } from "./tour-geometry";

// PRD-13: the first-run spotlight tour — its content and its ONE visibility
// rule. Pure data and pure functions (no React, no DOM) so the "should this
// run?" decision can be truth-tabled in a one-shot tsx script instead of only
// in a browser.

/** The tour only ever coaches the board. */
export const TOUR_PATHNAME = "/tasks";

/** Below this the sidebar is a slide-in drawer, so targets 1 and 5 do not
 * exist. The tour stays quiet and leaves `tour_state` NULL — which is the point
 * of storing the flag server-side: it still runs on their first desktop visit.
 * Matches AppShell's `max-[800px]` breakpoint. */
export const TOUR_MIN_WIDTH = 800;

/** The `data-tour` contract. Every id here must exist on exactly one element in
 * the surfaces the tour can run on; a missing one skips its step (§7.2) rather
 * than throwing. */
export type TourTargetId =
  "container-switcher" | "create-task" | "board-controls" | "notifications-bell" | "nav-team";

export type TourStep = {
  target: TourTargetId;
  title: string;
  body: string;
  /** Preferred side for the coach card; `cardPosition` flips it when the card
   * would leave the viewport. */
  side: CardSide;
};

/** Selector for a step's target. Kept here so the attribute name lives in one
 * file instead of being retyped at every call site. */
export const tourTargetSelector = (id: TourTargetId): string => `[data-tour="${id}"]`;

// Copy rules (docs/design/onboarding-guide-mockup.html §04): name the control by
// its on-screen label in its real casing, say what happens rather than how to
// feel, and never name a control that does nothing — the breadcrumb star, the
// filter-settings gear, the funnel, the layout button and the modal's expand
// button all render with no handler, so none of them is a target or a word here.
//
// Step 2's target id is shared by two elements on purpose: a fresh account
// renders the `No tasks yet` empty state (whose `Create your first task` button
// carries it) and the group headers — including the Todo `+` — do not exist at
// all, while a populated board renders the `+` and no empty state. Exactly one
// of the two is ever on screen, so one selector resolves to whichever it is and
// the step list can stay a constant instead of branching on board state.
export const TOUR_STEPS: TourStep[] = [
  {
    target: "container-switcher",
    title: "This is your workspace",
    body: "Everything on the board belongs to the container named here. A workspace is private to you; a team is shared — and a workspace becomes a team the moment someone accepts an invite.",
    side: "right",
  },
  {
    target: "create-task",
    title: "Everything starts with a task",
    body: "A title is the only required field. Steps you add here become the task's Checklist, and files you attach here stay on it.",
    side: "bottom",
  },
  {
    target: "board-controls",
    title: "Narrow the board",
    body: "Active, Today, This week and Done choose what is on screen. The dropdown at the other end of this row sorts by Manual, Priority or Due date. Both keep their value as you move around the app.",
    side: "bottom",
  },
  {
    target: "notifications-bell",
    title: "Invitations and deadlines land here",
    body: "Teammates invite you by @username — Accept sits right on the row. Tasks due within 48 hours turn up here too, red once they are overdue.",
    side: "left",
  },
  {
    target: "nav-team",
    title: "Projects, KPIs and people",
    body: "The Team page is where projects and KPIs are created, and where you invite people. Tasks borrow them from the … panel in the drawer.",
    side: "right",
  },
];

/** The primary button's label on the final step. */
export const TOUR_FINISH_LABEL = "Start using Mokara";

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
