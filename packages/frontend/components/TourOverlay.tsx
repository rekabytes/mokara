"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { api, type TourState } from "@/lib/api";
import { setSessionTourState, useSession } from "@/lib/session";
import {
  TOUR_FINISH_LABEL,
  TOUR_STEPS,
  atWalkthroughEnd,
  firstVisibleIndex,
  nextVisibleIndex,
  prevVisibleIndex,
  shouldRunTour,
  stepVisible,
  tourTargetSelector,
  waitSatisfied,
  type TourProgress,
} from "@/lib/onboarding";
import { CARD_W, cardPosition, frameOf, scrimPanels, type Rect } from "@/lib/tour-geometry";
import { DUR, snap, tourGlide } from "@/lib/motion";

// PRD-13: the first-run walkthrough. Dims the app, frames one real control,
// explains it — and, on ACT steps, leaves that control LIVE so the user can
// actually do the thing: open the form, fill it in, create the task, click the
// task, type in the drawer. The tour advances itself when the app reports the
// action happened; every step can be skipped, so nothing here can trap anyone.
//
// Mounted inside the tasks page rather than in AppShell (a deliberate delta from
// PRD-13 §6.2): the "never coach over a spinner" condition lives there as
// `boardReady`, and a module atom bridging it would go stale on the way back
// from /analytics — the page's own `loading` starts true on every mount, so the
// tour provably cannot start before the board exists. Targets are found with
// document.querySelector, so the sidebar's controls are reachable from here.
//
// Stacking: the overlay sits at z-[55] — above the page, the tasks modal, the
// drawer, the lightbox and the notification drawer (all z-50), and DELIBERATELY
// below the portal'd Dropdown / DatePicker menus (z-[60]): an ACT step asks the
// user to open a chip menu, and a menu rendered under the scrim would be dimmed
// and dead. Everything else in the shell lives inside AppShell's z-10 stacking
// context, so z-[55] clears it.

/** How many frames the hole keeps re-reading its target after a step change.
 * The drawer's width animation (240ms) and the modal's entrance keep moving the
 * target AFTER the step flips, so one measurement would land on a moving node.
 * Bounded on purpose — this is measurement, not an animation rig; presence still
 * belongs to <AnimatePresence>, and the loop dies with the effect that owns it.
 * 45 frames ≈ 750ms at 60fps. */
const SETTLE_FRAMES = 45;

export function TourOverlay({
  boardReady,
  progress,
}: {
  boardReady: boolean;
  progress: TourProgress;
}) {
  const session = useSession();
  const pathname = usePathname();
  const reduced = useReducedMotion();

  // The walkthrough starts where the product actually is: the helpers derive
  // the first applicable step from `progress`, so a user who already has tasks
  // skips the create phase instead of being re-taught it (and if the first
  // step ever gains a `when`, this is what keeps the start honest).
  const [index, setIndex] = useState(() => firstVisibleIndex(TOUR_STEPS, progress));
  const [hole, setHole] = useState<Rect | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Lazy + guarded: this is SSR-rendered, where `window` does not exist yet.
  // Starting at 0 would fail the width gate on the first client render and
  // flash the tour in a frame later.
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined" ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight }
  );

  const open = shouldRunTour({
    authed: session.status === "authed",
    // `undefined` when there is no session user at all — the gate fails closed.
    tourState: session.status === "authed" ? session.user.tour_state : undefined,
    pathname,
    boardReady,
    viewportWidth: viewport.w,
    dismissed,
  });

  const dismiss = useCallback((state: TourState) => {
    // Hide first, write second, never block the user on the write — the same
    // fire-and-forget posture as selectContainer -> PUT /me/last-container.
    // lib/api.ts already logged the failure; if it did not land, the tour
    // simply comes back on the next load (PRD-13 §7.3).
    setDismissed(true);
    setSessionTourState(state);
    void api.patchTourState(state).catch(() => undefined);
  }, []);

  /** Only repaint the hole when the rect actually moved — the scroll listener
   * fires per scroll tick, and an unconditional set would re-render on each. */
  const setHoleIfMoved = useCallback((next: Rect) => {
    setHole((prev) =>
      prev !== null &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.width === next.width &&
      prev.height === next.height
        ? prev
        : next
    );
  }, []);

  const step = TOUR_STEPS[index];
  // The true end is the array's last step, not "nothing ahead is visible right
  // now" — at form-submit every later phase is gated off in that snapshot, but
  // they come back the moment the user acts.
  const atTrueEnd = atWalkthroughEnd(TOUR_STEPS, index);
  // Mid-array exhaustion HOLDS: the card stays on a step that is still real,
  // and the progress effect resumes the walk on its own when the state changes.
  const holding = nextVisibleIndex(TOUR_STEPS, index, progress) === -1 && !atTrueEnd;

  // One advance for every button: Next on a LOOK step, and on a WAIT step too
  // (owner, 2026-09-09 — same label as everywhere else). Moving forward past
  // steps whose moment has passed is the point — a user who abandons the form
  // phase lands on the board walkthrough, not on a step for a closed modal.
  const advance = useCallback(() => {
    const next = nextVisibleIndex(TOUR_STEPS, index, progress);
    if (next === -1) {
      // Mid-array exhaustion HOLDS (owner flow bug, 2026-09-09): the remaining
      // phases are gated on facts that change when the user acts — creating the
      // task, opening the drawer, closing the form — so ending here would throw
      // away the walkthrough's second half and write `completed` permanently.
      // Only the array's last step may end it by button.
      if (atWalkthroughEnd(TOUR_STEPS, index)) dismiss("completed");
      return;
    }
    setIndex(next);
  }, [index, progress, dismiss]);

  const back = useCallback(() => {
    const prev = prevVisibleIndex(TOUR_STEPS, index, progress);
    if (prev !== -1) setIndex(prev);
  }, [index, progress]);

  // Syncs with the app's own state: the walkthrough advances itself when the
  // user does what a WAIT step asked for, and skips a step whose moment has
  // passed. Bounded — the index only ever moves forward, and -1 ends the tour.
  useEffect(() => {
    if (!open) return;
    if (!stepVisible(step, progress)) {
      advance();
      return;
    }
    if (waitSatisfied(step, progress)) advance();
  }, [open, step, progress, advance]);

  // Syncs with the DOM: the hole is positioned from the target's live rect, so
  // it is re-read on every step and on every viewport change. A target that no
  // longer exists (the Checklist and Files sections render only when non-empty)
  // skips its step instead of throwing — a tour that breaks the board is worse
  // than no tour. If the LAST one is missing there is nothing left to teach, so
  // the overlay closes WITHOUT writing: "completed" would be a lie they can
  // never undo.
  useEffect(() => {
    if (!open) return;
    const selector = tourTargetSelector(step.target);
    const el = document.querySelector(selector);
    if (el === null) {
      if (index === TOUR_STEPS.length - 1) setDismissed(true);
      else setIndex((i) => i + 1);
      return;
    }
    // The Todo "+", the task rows and the composer live inside scroll
    // containers (/tasks locks the page and scrolls internally), so bring the
    // target into view ONCE here; the settle loop below only measures, so it
    // never fights a scroll the user is making.
    el.scrollIntoView({ block: "nearest" });
    setHoleIfMoved(frameOf(el));

    // The drawer's width animation and the modal's entrance keep moving the
    // target after this step flips — re-read for a short, bounded window.
    let frames = 0;
    let raf = requestAnimationFrame(function settle() {
      const current = document.querySelector(selector);
      if (current !== null) setHoleIfMoved(frameOf(current));
      frames += 1;
      if (frames < SETTLE_FRAMES) raf = requestAnimationFrame(settle);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, index, step, viewport.w, viewport.h, setHoleIfMoved]);

  // Syncs with the window: hole and card are in viewport coordinates, so a
  // resize must re-measure both (and can also close the tour below 800px).
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Syncs with the DOM: on an ACT step the highlighted control is live, so the
  // user can scroll the board or the drawer's comment list and move the target
  // out from under the hole. Capture phase, because the scrollables are inner
  // containers the window never scrolls; passive, because this only reads.
  useEffect(() => {
    if (!open) return;
    const onScroll = () => {
      const el = document.querySelector(tourTargetSelector(step.target));
      if (el !== null) setHoleIfMoved(frameOf(el));
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, [open, step, setHoleIfMoved]);

  // Syncs with the keyboard: Esc is a skip, identical to the close button —
  // EXCEPT while the user is typing in a live control, where Esc belongs to the
  // control, not the tour (the same suppression the task drawer's own Esc
  // handler applies). Skipping from inside the title field would throw away the
  // edit and the walkthrough in one keystroke; instead the modal's own Esc
  // closes it and the walkthrough degrades to the next applicable step.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      dismiss("skipped");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  // Geometry is top/left/width/height rather than x/y transforms on purpose:
  // MotionConfig reducedMotion="user" strips TRANSFORMS, which would drop the
  // hole at the viewport origin for reduced-motion users. Layout properties
  // survive that setting, so they are gated here instead — jump, never glide.
  const glide = reduced === true ? { duration: 0 } : tourGlide;
  const pos = hole === null ? null : cardPosition(hole, step.side, viewport.w, viewport.h);
  const waiting = step.waitFor !== undefined;
  // ACT steps keep the hole live: four bands around it catch the clicks, so the
  // framed control stays usable. Every other step blocks everything.
  const catchers = hole === null ? [] : step.act ? scrimPanels(hole, viewport.w, viewport.h) : [];

  return (
    <AnimatePresence>
      {open && hole !== null && pos !== null ? (
        <motion.div
          key="tour-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Product tour"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={snap(DUR.panel)}
          // pointer-events-none is what makes ACT steps work at all: a bare div
          // hit-tests across its whole bounds even with no background, so this
          // root was swallowing every click itself — the hole's own
          // pointer-events-none never came into play because the parent was
          // already the hit target. The catchers and the card opt back in below.
          className="fixed inset-0 z-[55] pointer-events-none"
        >
          {(step.act ? catchers : [{ top: 0, left: 0, width: viewport.w, height: viewport.h }]).map(
            (r, i) => (
              <motion.div
                key={`catcher-${i}`}
                aria-hidden="true"
                initial={false}
                animate={r}
                transition={glide}
                className="absolute pointer-events-auto"
              />
            )
          )}

          {/* The hole. Its 9999px spread shadow IS the scrim, so one element
              carries both and the dim follows the frame as it travels. */}
          <motion.div
            aria-hidden="true"
            initial={false}
            animate={hole}
            transition={glide}
            className="pointer-events-none absolute rounded-[12px] shadow-[0_0_0_2px_var(--color-surface-solid),0_0_0_9999px_rgba(15,23,42,0.44)]"
          />

          <motion.div
            initial={false}
            animate={pos}
            transition={glide}
            onKeyDown={
              step.act
                ? undefined
                : (e) => {
                    // aria-modal="true" claims the page behind is inert; the
                    // trap is what makes that true. On an ACT step the trap is
                    // lifted — the whole point of those steps is that the user
                    // reaches the framed control, and a keyboard user should be
                    // able to Tab to it like anyone else.
                    if (e.key !== "Tab") return;
                    const nodes =
                      e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
                    if (nodes.length === 0) return;
                    const first = nodes[0];
                    const lastNode = nodes[nodes.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                      e.preventDefault();
                      lastNode.focus();
                    } else if (!e.shiftKey && document.activeElement === lastNode) {
                      e.preventDefault();
                      first.focus();
                    }
                  }
            }
            className="absolute pointer-events-auto"
            style={{ width: CARD_W }}
          >
            <div className="rounded-[14px] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] px-4 py-3.5 shadow-[var(--shadow-lift)]">
              <div className="flex items-start gap-2">
                <span
                  aria-live="polite"
                  className="text-[0.68rem] font-bold tracking-[0.07em] text-[var(--color-accent)] uppercase"
                >
                  Step {index + 1} of {TOUR_STEPS.length}
                </span>
                <button
                  type="button"
                  onClick={() => dismiss("skipped")}
                  aria-label="Close tour"
                  className="-mt-0.5 -mr-1 ml-auto grid size-6 shrink-0 cursor-pointer place-items-center rounded text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                >
                  <CloseIcon />
                </button>
              </div>

              <h2 className="m-0 mt-1.5 text-[0.95rem] font-bold tracking-[-0.01em] text-[var(--color-ink)]">
                {step.title}
              </h2>
              <p className="m-0 mt-1 text-[0.82rem] leading-[1.55] text-[var(--color-ink-muted)]">
                {step.body}
              </p>
              {waiting && (
                <p className="m-0 mt-1.5 text-[0.72rem] font-semibold text-[var(--color-accent)]">
                  Waiting for you — the highlighted control is live.
                </p>
              )}

              <div className="mt-3.5 flex items-center gap-2">
                {/* 21 steps: a dot row stopped being information and became
                    noise, so the counter above carries the position alone. */}
                <span className="mr-auto" />
                <button
                  type="button"
                  onClick={() => dismiss("skipped")}
                  className="btn-base btn-ghost btn-small"
                >
                  Skip tour
                </button>
                {prevVisibleIndex(TOUR_STEPS, index, progress) !== -1 && (
                  <button type="button" onClick={back} className="btn-base btn-ghost btn-small">
                    Back
                  </button>
                )}
                {/* autoFocus is the whole focus story: it moves focus into the
                    dialog on mount, and because this element persists across
                    steps the focus follows the tour without an effect.
                    Hidden while HOLDING (owner flow bug): a Next that does
                    nothing is a lie — the hint above already says what the
                    walkthrough is waiting for, and Skip tour is the way out. */}
                {!holding && (
                  <button
                    type="button"
                    onClick={advance}
                    autoFocus
                    className="btn-base btn-primary btn-small"
                  >
                    {atTrueEnd ? TOUR_FINISH_LABEL : "Next"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
