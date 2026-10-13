"use client";

import { useCallback, useRef } from "react";

const focusable = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';

function visibleElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusable)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      element.getClientRects().length > 0
  );
}

function topScope(): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-focus-scope]"))
    .filter((element) => element.getClientRects().length > 0)
    .sort(
      (a, b) =>
        (Number.parseInt(getComputedStyle(a).zIndex) || 0) -
        (Number.parseInt(getComputedStyle(b).zIndex) || 0)
    )
    .at(-1);
}

/** DOM focus belongs to a mounted overlay, including its presence exit.
 * A callback-ref cleanup owns the keyboard listener and restores the opener;
 * no state mirror, timer, animation effect or separate focus store is needed.
 * Non-modal/ACT tours may move focus freely; only the top modal contains Tab.
 */
export function useDialogFocus({
  modal = true,
  mediaQuery,
}: { modal?: boolean; mediaQuery?: string } = {}) {
  const queryRef = useRef(mediaQuery);
  queryRef.current = mediaQuery;
  const modalRef = useRef(modal);
  modalRef.current = modal;
  return useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const opener = document.activeElement;
    const isActive = () => !queryRef.current || window.matchMedia(queryRef.current).matches;
    if (isActive() && topScope() === node) {
      const initial = node.querySelector<HTMLElement>("[data-autofocus]");
      (initial ?? visibleElements(node)[0] ?? node).focus({ preventScroll: true });
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !modalRef.current || !isActive() || topScope() !== node) return;
      // Chip/date menus are portals above this modal. They remain in the same
      // keyboard scope instead of being pushed behind the focus boundary.
      const portals = Array.from(
        document.querySelectorAll<HTMLElement>("[data-dropdown-menu], [data-date-menu]")
      );
      const items = [...visibleElements(node), ...portals.flatMap(visibleElements)];
      event.preventDefault();
      const current = items.findIndex((item) => item === document.activeElement);
      const next =
        current === -1
          ? event.shiftKey
            ? items.length - 1
            : 0
          : (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      (items[next] ?? node).focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // Do not steal focus if the user already moved into another surface.
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        (node.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);
}
