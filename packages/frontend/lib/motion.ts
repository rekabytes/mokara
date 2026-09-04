import type { Transition, Variants } from "framer-motion";

// Single source of truth for motion. Every animated surface in the app pulls its
// easing + duration from here so nothing invents its own curve, and no component
// needs a mount/exit effect to look alive: presence is owned by <AnimatePresence>,
// timing by these variants.
//
// Durations mirror the CSS already in globals.css (`--ease-snap`
// cubic-bezier(0.22,1,0.36,1), 0.16s on .btn-base, 0.18s on inputs) so motion
// elements and plain `transition-*` elements feel like the same product.

/** Matches `--ease-snap` in globals.css. Mutable tuple: framer-motion's bezier type. */
export const EASE_SNAP: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const DUR = {
  /** Toggles, checkmarks, banners. */
  fast: 0.12,
  /** Default for anything that answers a click. Mirrors .btn-base. */
  base: 0.16,
  /** Popovers and menus. */
  pop: 0.18,
  /** Drawer, modals, collapsible sections — the big surfaces. */
  panel: 0.24,
};

/** A snap-eased transition over `duration` seconds. */
export const snap = (duration: number): Transition => ({ duration, ease: EASE_SNAP });

// ---- Popovers / dropdowns / date picker ------------------------------------
// Mounts under a portal, so `exit` needs AnimatePresence to wrap the portal
// itself. Callers must NOT null out a measured position on close: the exiting
// frame reuses the last one, which is what keeps it from flashing at 0,0.

export const popoverVariants: Variants = {
  hidden: { opacity: 0, y: -4, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: snap(DUR.pop) },
};

// ---- Modals ----------------------------------------------------------------

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: snap(DUR.base) },
  exit: { opacity: 0, transition: snap(DUR.fast) },
};

export const sheetVariants: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: snap(DUR.panel) },
  exit: { opacity: 0, y: 10, scale: 0.985, transition: snap(DUR.fast) },
};

// ---- Notification drawer (right side, PRD-05) ------------------------------
// Slides in from the right edge — the sibling of the tasks drawer's surface.
export const notifDrawerVariants: Variants = {
  hidden: { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0, transition: snap(DUR.panel) },
  exit: { opacity: 0, x: 32, transition: snap(DUR.fast) },
};

// ---- Inline lists (comments, layers, archived sections) ---------------------
// Enter from above (the row appeared where the last one ended), leave sideways
// so a deletion reads as "removed" rather than "scrolled away".

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0, transition: snap(DUR.base) },
  exit: { opacity: 0, x: -10, transition: snap(DUR.fast) },
};

// ---- Collapsible blocks (task groups, archived layers) ----------------------
// `height: "auto"` is measured by framer-motion, so no scrollHeight in an effect.
// Callers must keep `overflow-hidden` on the same element.

export const collapseVariants: Variants = {
  hidden: { height: 0, opacity: 0, transition: snap(DUR.base) },
  visible: { height: "auto", opacity: 1, transition: snap(DUR.panel) },
};

// ---- Banners (error / notice) ----------------------------------------------

export const bannerVariants: Variants = {
  hidden: { opacity: 0, height: 0, y: -4, transition: snap(DUR.fast) },
  visible: {
    opacity: 1,
    height: "auto",
    y: 0,
    transition: { duration: DUR.base, ease: EASE_SNAP },
  },
};

// ---- Small in-place affordances (checkmarks, chevrons) ----------------------

export const tickVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: { opacity: 1, scale: 1, transition: snap(DUR.fast) },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.08, ease: EASE_SNAP } },
};

// ---- Landing: hero entrance, scroll reveal, tilt ----------------------------
// All one-shot (load / whileInView once) — the page's identity is calm, so
// nothing loops. MotionConfig reducedMotion="user" strips the transforms for
// reduced-motion users, leaving opacity-only fades.

/** Stagger parent for the hero text block. */
export const heroContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/** One hero child rising in. */
export const heroItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: snap(DUR.panel) },
};

/** Hero media sliding in from the right, just after the text starts. */
export const heroMedia: Variants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: snap(DUR.panel + 0.08) },
};

/** Scroll-reveal for below-the-fold sections (whileInView, once). */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: snap(DUR.panel + 0.08) },
};

/** Spring for the pointer-tilt panel — soft, settles without wobble. */
export const tiltSpring: Transition & { stiffness: number; damping: number; mass: number } = {
  stiffness: 180,
  damping: 24,
  mass: 0.6,
};
