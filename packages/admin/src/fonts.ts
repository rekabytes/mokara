import { readFileSync } from "node:fs";

// Fixed, module-relative assets work in both the source checkout and admin image.
// The Latin subsets and their OFL licenses are vendored together; no CDN is used.
export const ADMIN_FONTS = [
  {
    path: "/assets/fonts/instrument-sans-latin.woff2",
    data: new Uint8Array(
      readFileSync(new URL("./fonts/instrument-sans-latin.woff2", import.meta.url))
    ),
  },
  {
    path: "/assets/fonts/ibm-plex-mono-latin-400.woff2",
    data: new Uint8Array(
      readFileSync(new URL("./fonts/ibm-plex-mono-latin-400.woff2", import.meta.url))
    ),
  },
];
