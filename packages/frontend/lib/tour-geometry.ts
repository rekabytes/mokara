// PRD-13: the spotlight tour's geometry — pure functions, no React, no DOM
// reads beyond the one `getBoundingClientRect()` in `frameOf`. Split out of
// `TourOverlay` so the placement maths can be asserted in a one-shot script:
// the overlay itself can only be checked in a browser, and the honest answer to
// "does the card stay on screen?" should not depend on someone looking.

/** A highlighted control's frame, in viewport coordinates. */
export type Rect = { top: number; left: number; width: number; height: number };

/** Breathing room around a target, so the hole reads as a frame not a clip. */
export const HOLE_PAD = 5;
export const CARD_W = 320;
/** Only used to keep the card inside the viewport before it has been measured —
 * the copy is fixed, so the real height is stable across the five steps. */
export const CARD_H = 200;
export const CARD_GAP = 14;
/** Never let the card or the hole sit flush against the viewport edge. */
export const EDGE = 16;

export type CardSide = "right" | "left" | "bottom";

export function frameOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return {
    top: r.top - HOLE_PAD,
    left: r.left - HOLE_PAD,
    width: r.width + HOLE_PAD * 2,
    height: r.height + HOLE_PAD * 2,
  };
}

/** Where the coach card sits for a step: the preferred side, flipped and then
 * clamped when it would leave the viewport.
 *
 * The clamp is the part that matters: flipping alone assumes the other side has
 * room, which is false for a target near the right edge (the notification bell)
 * or on a narrow window — without it the card lands partly off screen. Both
 * axes clamp to `EDGE … viewport - size - EDGE`, and the inner `Math.max` keeps
 * the bound sane if the viewport is somehow smaller than the card.
 *
 * Vertical clamping uses `CARD_H`, the estimate described above. */
export function cardPosition(
  hole: Rect,
  side: CardSide,
  vw: number,
  vh: number
): { top: number; left: number } {
  let left =
    side === "left"
      ? hole.left - CARD_GAP - CARD_W
      : side === "right"
        ? hole.left + hole.width + CARD_GAP
        : hole.left;
  let top = side === "bottom" ? hole.top + hole.height + CARD_GAP : hole.top;

  if (left + CARD_W > vw - EDGE) left = hole.left - CARD_GAP - CARD_W;
  left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - CARD_W - EDGE));

  if (top + CARD_H > vh - EDGE) top = hole.top - CARD_GAP - CARD_H;
  top = Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - CARD_H - EDGE));

  return { top, left };
}
