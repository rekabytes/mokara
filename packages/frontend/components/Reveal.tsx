"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { reveal } from "@/lib/motion";

// One-shot scroll reveal for below-the-fold landing sections. `once: true` —
// the entrance plays a single time; nothing loops. Under reduced motion,
// MotionConfig strips the y-shift and only the fade remains.
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={reveal}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </motion.div>
  );
}
