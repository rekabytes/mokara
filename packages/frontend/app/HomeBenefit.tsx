"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { homepageBenefitReveal } from "@/lib/motion";

/** Start from readable server HTML; play once when the card enters the viewport. */
export function HomeBenefit({ children, index }: { children: ReactNode; index: number }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.article
      className="home-benefit"
      initial={false}
      whileInView={reducedMotion ? undefined : "show"}
      viewport={{ once: true, amount: 0.15 }}
      variants={homepageBenefitReveal}
      custom={index}
    >
      {children}
    </motion.article>
  );
}
