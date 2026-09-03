"use client";

import { AnimatePresence, motion } from "framer-motion";
import { bannerVariants } from "@/lib/motion";
import { cn } from "@/lib/cn";

// One error banner for the whole app. Every page already funnels failures
// through useAsyncError → `error.message`, so this is the only place that
// decides how a failure looks and how it leaves.
//
// It used to be six hand-copied <div>s that appeared and vanished between two
// renders. Enter and exit are AnimatePresence's job now, which is also why
// there is no effect in this file: nothing has to be scheduled to make the
// banner leave, it just stops being rendered and animates out on the way.

export function ErrorBanner({
  message,
  className,
}: {
  message: string | null | undefined;
  /** Vertical rhythm only — the banner owns its own look. */
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.div
          key="error-banner"
          role="alert"
          variants={bannerVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className={cn(
            "overflow-hidden rounded-[var(--radius-btn)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.08)] text-[0.88rem] text-[var(--color-danger-ink)]",
            className
          )}
        >
          {/* Padding lives inside the animated box so the height collapse
              closes all the way to 0 instead of leaving the gutter behind. */}
          <span className="block px-4 py-[0.7rem]">{message}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
