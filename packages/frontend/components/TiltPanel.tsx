"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { tiltSpring } from "@/lib/motion";

// Pointer-tilt panel: the card leans ~2° toward the cursor and springs back on
// leave — the interactive, calm replacement for a floating loop. Mouse-only
// (touch drags are ignored), disabled entirely under reduced motion.
export function TiltPanel({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [2, -2]), tiltSpring);
  const rotateY = useSpring(useTransform(mx, [0, 1], [-2.4, 2.4]), tiltSpring);

  if (reduced) {
    return <div className={className}>{children}</div>;
  }

  const track = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };
  const reset = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.div
      className={className}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={track}
      onPointerLeave={reset}
    >
      {children}
    </motion.div>
  );
}
