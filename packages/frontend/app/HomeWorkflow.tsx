"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DUR, snap } from "@/lib/motion";

const examples = [
  {
    label: "Create",
    prompt: "Add a task to improve onboarding, and create a GitHub issue for it.",
    title: "Make the first five minutes feel effortless",
    status: "Todo",
    detail: "Onboarding · Medium priority",
    response: "Task created. GitHub issue linked.",
    action: "Issue #42",
    steps: ["Map the first-run experience", "Review the welcome screen"],
  },
  {
    label: "Catch up",
    prompt: "What should our team focus on this week?",
    title: "A little clarity for Monday",
    status: "This week",
    detail: "Example workspace · Weekly overview",
    response: "Here’s the work that needs your attention.",
    action: "2 priorities",
    steps: ["Finish the onboarding review", "Prepare the release notes"],
  },
  {
    label: "Move forward",
    prompt: "Mark the onboarding review as done.",
    title: "Review the welcome screen",
    status: "Done",
    detail: "Onboarding · Task updated",
    response: "Done. Your workspace is up to date.",
    action: "Completed",
    steps: ["Feedback collected", "Changes approved"],
  },
] as const;

/** Local, illustrative preview. It never calls the API or changes a workspace. */
export function HomeWorkflow() {
  const [selected, setSelected] = useState(0);
  const reducedMotion = useReducedMotion();
  const example = examples[selected];
  return (
    <div className="home-workflow">
      <div className="home-example-heading">
        <span className="home-overline">A conversation. Real progress.</span>
        <span>Interactive example</span>
      </div>
      <div className="home-example-options" role="group" aria-label="Choose an example workflow">
        {examples.map((item, index) => (
          <button
            key={item.label}
            type="button"
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="home-example-stage" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={snap(DUR.panel)}
          >
            <div className="home-prompt">
              <span className="home-prompt-mark" aria-hidden>
                ↗
              </span>
              <p>{example.prompt}</p>
            </div>
            <div className="home-connector" aria-hidden>
              <span />
              MOKARA MCP
              <span />
            </div>
            <div className="home-task-preview">
              <div className="home-task-top">
                <span>
                  Mokara <span aria-hidden> / </span> Onboarding
                </span>
                <span className={`home-status ${selected === 2 ? "is-done" : ""}`}>
                  {example.status}
                </span>
              </div>
              <h3>{example.title}</h3>
              <p className="home-task-meta">{example.detail}</p>
              <div className="home-task-steps">
                {example.steps.map((step) => (
                  <p key={step}>
                    <span aria-hidden>{selected === 2 ? "✓" : "○"}</span>
                    {step}
                  </p>
                ))}
              </div>
              <div className="home-task-bottom">
                <span className="home-initials" aria-hidden>
                  MK
                </span>
                <span>Design team</span>
                <span className="home-issue">{example.action}</span>
              </div>
            </div>
            <p className="home-agent-result">
              <span aria-hidden>✓</span>
              {example.response}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="home-example-note">
        Illustrative workflow. You choose the access your agent gets.
      </p>
    </div>
  );
}
