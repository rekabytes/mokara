"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { homepageBenefitReveal } from "@/lib/motion";

/** Viewport keyframes enhance already-visible server content, once per section. */
export function HomeSection({
  children,
  className,
  id,
  labelledBy,
}: {
  children: ReactNode;
  className: string;
  id?: string;
  labelledBy: string;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.section
      id={id}
      className={className}
      aria-labelledby={labelledBy}
      initial={false}
      custom={0}
      variants={homepageBenefitReveal}
      whileInView={reducedMotion ? undefined : "show"}
      viewport={{ once: true, amount: 0.12 }}
    >
      {children}
    </motion.section>
  );
}
