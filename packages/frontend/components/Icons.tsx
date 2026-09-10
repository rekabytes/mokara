// Shared hand-drawn inline SVG icons (viewBox "0 0 24 24", stroke="currentColor",
// aria-hidden — the house icon rule; no icon library).
//
// Scope: an icon lives HERE only once a second file needs the byte-identical
// shape. Route-private icons stay in a route-local `icons.tsx` beside the page
// that draws them, so this module never becomes a grab-bag.
export function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1.1 6L12 17.3 6.6 20l1.1-6L3.3 9.9l6-.9L12 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
