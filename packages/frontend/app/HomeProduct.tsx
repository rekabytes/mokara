"use client";

import { useState } from "react";
import Image from "next/image";
import shotBoard from "../public/landing/hero-board.webp";
import shotTeam from "../public/landing/shot-team.webp";
import shotAnalytics from "../public/landing/shot-analytics.webp";

const views = [
  {
    label: "Tasks",
    title: "The day, in focus.",
    text: "Give every task a clear owner, a priority and a next step. Keep the details close and the list easy to scan.",
    image: shotBoard,
    alt: "Mokara task board with grouped tasks, priorities, project labels and due dates.",
  },
  {
    label: "Team",
    title: "Everyone on the same page.",
    text: "Bring people, projects and shared goals into one workspace. See who is doing what, without another round of messages.",
    image: shotTeam,
    alt: "Mokara team workspace with project progress, members and personal KPIs.",
  },
  {
    label: "Progress",
    title: "See the work moving.",
    text: "Follow timelines and deadlines together. Find the work that needs attention and make room for what comes next.",
    image: shotAnalytics,
    alt: "Mokara progress view showing a heatmap, task timelines and deadlines.",
  },
] as const;

export function HomeProduct() {
  const [selected, setSelected] = useState(0);
  const view = views[selected];
  return (
    <div className="home-product-explorer">
      <div className="home-product-rail">
        <div className="home-product-options" role="group" aria-label="Choose a product view">
          {views.map((item, index) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={selected === index}
              aria-controls="home-product-preview"
              onClick={() => setSelected(index)}
            >
              <span className="home-index">0{index + 1}</span>
              {item.label}
              <span aria-hidden>↗</span>
            </button>
          ))}
        </div>
        <div className="home-product-description" aria-live="polite">
          <h3>{view.title}</h3>
          <p>{view.text}</p>
        </div>
        <p className="home-image-label">
          Actual product.
          <br />
          Example workspace.
        </p>
      </div>
      <figure id="home-product-preview" className="home-product-figure">
        <div className="home-product-window">
          <span aria-hidden>● ● ●</span>
          <span>Mokara / {view.label}</span>
          <span>Workspace</span>
        </div>
        <div
          className="home-product-image"
          role="region"
          tabIndex={0}
          aria-label={`${view.label} screenshot. Scroll to explore, or open the full-size image below.`}
        >
          <Image
            src={view.image}
            alt={view.alt}
            sizes="(max-width: 800px) calc(100vw - 40px), (max-width: 1400px) 70vw, 900px"
          />
        </div>
        <figcaption>
          <span>{view.label} view</span>
          <a href={view.image.src} target="_blank" rel="noopener noreferrer">
            Open full size <span aria-hidden>↗</span>
            <span className="sr-only"> in a new tab</span>
          </a>
        </figcaption>
      </figure>
    </div>
  );
}
