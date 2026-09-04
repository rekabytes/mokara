"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { heroContainer, heroItem, heroMedia } from "@/lib/motion";
import { TiltPanel } from "./TiltPanel";
import heroBoard from "../public/landing/hero-board.webp";

// The hero, as one client unit so the entrance can stagger: text rises first,
// the board slides in from the right, and the board leans toward the cursor
// (TiltPanel). One-shot on load — nothing loops.
export function HeroSplit({ authHref, authLabel }: { authHref: string; authLabel: string }) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-12 md:gap-6">
      <motion.div
        className="md:col-span-5"
        variants={heroContainer}
        initial="hidden"
        animate="show"
      >
        <motion.p
          variants={heroItem}
          className="m-0 font-label text-[0.7rem] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-faint)]"
        >
          A quiet task board for small teams
        </motion.p>
        <motion.h1
          variants={heroItem}
          className="m-0 mt-4 font-display text-[3.3rem] font-semibold leading-[1.02] tracking-[-0.015em] sm:text-[4rem]"
        >
          Team tasks, <em className="italic text-[var(--color-accent)]">calmly.</em>
        </motion.h1>
        <motion.p
          variants={heroItem}
          className="mb-0 mt-5 max-w-md text-[1.02rem] leading-relaxed text-[var(--color-ink-muted)]"
        >
          Statuses, projects and weighted KPIs in one place — with a heatmap and activity lines that
          answer real questions.
        </motion.p>
        <motion.div variants={heroItem} className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className="rounded-[var(--radius-btn)] bg-[var(--color-accent)] px-5 py-2.5 text-[0.95rem] font-semibold text-white shadow-[var(--shadow-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Get started
          </Link>
          <Link
            href={authHref}
            className="rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-5 py-2.5 text-[0.95rem] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            {authLabel}
          </Link>
        </motion.div>
        <motion.p
          variants={heroItem}
          className="mb-0 mt-6 font-label text-[0.72rem] tracking-[0.06em] text-[var(--color-ink-faint)]"
        >
          self-hostable · docker images on every release
        </motion.p>
      </motion.div>

      <motion.div className="md:col-span-7" variants={heroMedia} initial="hidden" animate="show">
        <TiltPanel className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] shadow-[var(--shadow-lift)]">
          <Image
            src={heroBoard}
            alt="The Mokara board — grouped tasks with priorities, due dates, project chips and weighted KPIs"
            className="h-auto w-full"
            unoptimized
            priority
          />
        </TiltPanel>
      </motion.div>
    </div>
  );
}
