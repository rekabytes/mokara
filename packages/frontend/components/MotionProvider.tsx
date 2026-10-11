"use client";

import { MotionConfig } from "framer-motion";

// One motion config for the whole app, mounted in the root layout so the
// auth screens (which render outside AppShell) inherit it too.
//
// `reducedMotion: "user"` honours the OS "reduce motion" setting by dropping
// transform/layout animations; opacity and color transitions can remain — the
// components with other moving geometry must select a reduced alternative.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
