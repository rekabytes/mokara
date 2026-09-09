"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { api, type TourState } from "@/lib/api";
import { setSessionTourState, useSession } from "@/lib/session";
import { TOUR_FINISH_LABEL, TOUR_STEPS, shouldRunTour, tourTargetSelector } from "@/lib/onboarding";
import { CARD_W, cardPosition, frameOf, type Rect } from "@/lib/tour-geometry";
import { DUR, snap, tourGlide } from "@/lib/motion";

// PRD-13: the first-run spotlight tour. Dims the app, frames one real control,
// explains it, and writes the dismissal to the server so it never comes back.
//
// Mounted inside the tasks page rather than in AppShell (a deliberate delta from
// PRD-13 §6.2): the "never coach over a spinner" condition lives there as
// `boardReady`, and a module atom bridging it would go stale on the way back
// from /analytics — the page's own `loading` starts true on every mount, so the
// tour provably cannot start before the board exists. Targets are found with
// document.querySelector, so the sidebar's controls are reachable from here.
//
// Stacking: AppShell's root is the stacking context (`relative z-10`) and the
// sidebar sits at z-10 inside it, so z-[70] here clears the sidebar (z-10), the
// notification drawer (z-50) and the tasks modal/lightbox (z-50) plus the
// portal'd dropdown menus (z-[60]).

export function TourOverlay({ boardReady }: { boardReady: boolean }) {
  const session = useSession();
  const pathname = usePathname();
  const reduced = useReducedMotion();

  const [index, setIndex] = useState(0);
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

  const last = index === TOUR_STEPS.length - 1;

  const next = useCallback(() => {
    if (last) {
      dismiss("completed");
      return;
    }
    setIndex((i) => i + 1);
  }, [last, dismiss]);

  // Syncs with the DOM: the hole is positioned from the target's live rect, so
  // it is re-read on every step and on every viewport change. A target that no
  // longer exists skips its step instead of throwing — a tour that breaks the
  // board is worse than no tour. If the last one is missing there is nothing
  // left to teach, so the overlay closes WITHOUT writing: the user saw no tour,
  // and "completed" would be a lie they can never undo.
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(tourTargetSelector(TOUR_STEPS[index].target));
    if (el === null) {
      if (last) setDismissed(true);
      else setIndex((i) => i + 1);
      return;
    }
    // The Todo "+" lives inside the board's own scroll container (/tasks locks
    // the page and scrolls internally), so bring it into view before measuring.
    el.scrollIntoView({ block: "nearest" });
    setHole(frameOf(el));
  }, [open, index, last, viewport.w, viewport.h]);

  // Syncs with the window: hole and card are in viewport coordinates, so a
  // resize must re-measure both (and can also close the tour below 800px).
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Syncs with the keyboard: Esc is a skip, identical to the close button. The
  // scrim means nothing else is open, so no other Esc handler competes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
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
  const step = TOUR_STEPS[index];
  const pos = hole === null ? null : cardPosition(hole, step.side, viewport.w, viewport.h);

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
          className="fixed inset-0 z-[70]"
        >
          {/* Swallows every click outside the card. Transparent — the visible
              dimming is the hole's spread shadow below. */}
          <div className="absolute inset-0" />

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
            onKeyDown={(e) => {
              // aria-modal="true" claims the page behind is inert; this is what
              // makes that true instead of merely claimed.
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
            }}
            className="absolute"
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

              <div className="mt-3.5 flex items-center gap-2">
                <span className="mr-auto flex items-center gap-1" aria-hidden="true">
                  {TOUR_STEPS.map((s, i) => (
                    <span
                      key={s.target}
                      className={
                        i === index
                          ? "block h-[5px] w-3.5 rounded-full bg-[var(--color-accent)]"
                          : "block size-[5px] rounded-full bg-[var(--color-border-strong)]"
                      }
                    />
                  ))}
                </span>
                <button
                  type="button"
                  onClick={() => dismiss("skipped")}
                  className="btn-base btn-ghost btn-small"
                >
                  Skip tour
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                    className="btn-base btn-ghost btn-small"
                  >
                    Back
                  </button>
                )}
                {/* autoFocus is the whole focus story: it moves focus into the
                    dialog on mount, and because this element persists across
                    steps the focus follows the tour without an effect. */}
                <button
                  type="button"
                  onClick={next}
                  autoFocus
                  className="btn-base btn-primary btn-small"
                >
                  {last ? TOUR_FINISH_LABEL : "Next"}
                </button>
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
