"use client";

import { MotionConfig } from "framer-motion";

// One motion config for the whole app, mounted in the root layout so the
// auth screens (which render outside AppShell) inherit it too.
//
// `reducedMotion: "user"` honours the OS "reduce motion" setting by dropping
// transforms/opacity on every variant in lib/motion.ts at once — the
// alternative, useReducedMotion() per component, returns null during SSR and
// desynchronises the first client render.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
