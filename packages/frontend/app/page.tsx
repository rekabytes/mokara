import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AUTH_COOKIE } from "@/lib/cookies";
import shotBoard from "../public/landing/hero-board.webp";
import shotDrawer from "../public/landing/shot-drawer.webp";
import shotTeam from "../public/landing/shot-team.webp";
import shotAnalytics from "../public/landing/shot-analytics.webp";
import { HomeField } from "./HomeField";
import { HomeSection } from "./HomeSection";
import "./homepage.css";

export const metadata: Metadata = {
  title: "Mokara — a shared workspace for small teams",
  description:
    "A little more clarity for your working day. Bring tasks, projects, and conversations together in Mokara, the shared workspace for small teams.",
  openGraph: {
    title: "Mokara — a clear head. A shared workspace.",
    description: "Tasks, projects, and conversations. One place to move work forward together.",
    images: ["/landing/og.jpg"],
  },
};

const VIEWS = [
  {
    id: "tasks",
    tab: "Tasks",
    label: "Find your focus",
    description: "Give every task an owner, a priority, and a place in the day.",
    caption: "The daily work, with all the important details in view.",
    image: shotBoard,
    alt: "Mokara task board with task groups, priorities, project labels, and due dates.",
    path: "M5 5h14v14H5zM9 9h6m-6 4h4",
  },
  {
    id: "projects",
    tab: "Team",
    label: "Bring everyone together",
    description: "Connect your people and projects in a shared team workspace.",
    caption: "A shared home for your team and its projects.",
    image: shotTeam,
    alt: "Mokara team workspace with project progress, team members, and personal KPIs.",
    path: "M3 7h7l2 3h9v10H3zM3 7V4h7l2 3h7v3",
  },
  {
    id: "progress",
    tab: "Progress",
    label: "See the bigger picture",
    description: "Follow task progress and deadlines without chasing another update.",
    caption: "Progress and deadlines, seen together rather than in separate updates.",
    image: shotAnalytics,
    alt: "Mokara progress heatmap showing task timelines and deadlines.",
    path: "M4 4v16h16M8 15v-4m5 4V7m5 8V4",
  },
];
const FAQS = [
  {
    question: "Can I use Mokara on my own?",
    answer:
      "Absolutely. Start in a personal workspace to organise your own tasks. When you’re ready to work with others, bring them into a shared workspace.",
  },
  {
    question: "What’s included in the Free plan?",
    answer: (
      <>
        The Free plan supports up to three people per team and includes the core task features. No
        credit card is needed to create an account.{" "}
        <Link href="/pricing">See all plans and capacity limits.</Link>
      </>
    ),
  },
  {
    question: "How do I invite my team?",
    answer:
      "Your teammates create an account, then you invite them by username from the Team page. When the first invitation is accepted, your workspace becomes a team and the work is shared.",
  },
  {
    question: "Can I host Mokara myself?",
    answer:
      "Yes. Self-hosting is free and doesn’t have the hosted capacity caps. You manage your own infrastructure and data. Or choose the hosted service if you’d rather leave server management to us.",
  },
];

export default async function LandingPage() {
  const hasSession = (await cookies()).has(AUTH_COOKIE);
  const startHref = hasSession ? "/tasks" : "/signup";
  const startLabel = hasSession ? "Open your workspace" : "Create your free workspace";
  return (
    <div className="public-site homepage">
      <a className="homepage-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader
        authHref={hasSession ? "/tasks" : "/login"}
        authLabel={hasSession ? "Open app" : "Log in"}
      />
      <main id="main">
        <div className="home-hero-scene">
          <HomeField />
          <HomeSection className="home-hero public-container" labelledBy="hero-title">
            <p className="home-kicker">Made for the way small teams work</p>
            <h1 id="hero-title">
              A clear head. <span>A shared workspace.</span>
            </h1>
            <p className="home-intro">
              Tasks, projects, and all the conversations in between. Give your team one place to
              turn plans into progress.
            </p>
            <div className="home-hero-action">
              <Link className="public-button public-button-primary" href={startHref}>
                {startLabel}
                <Arrow />
              </Link>
              <a className="home-text-link" href="#product">
                Take a look inside
                <Arrow />
              </a>
            </div>
            <p className="home-reassurance">
              {hasSession
                ? "Your next step is already waiting."
                : "Free for up to 3 people per team. No credit card needed."}
            </p>
          </HomeSection>
        </div>

        <HomeSection className="home-demo public-container" labelledBy="demo-title">
          <h2 id="demo-title" className="sr-only">
            A look inside Mokara
          </h2>
          <figure>
            <div
              className="home-demo-viewport"
              role="region"
              tabIndex={0}
              aria-label="Mokara task board. Scroll horizontally on smaller screens."
            >
              <Image
                src={shotBoard}
                alt="Mokara task board showing task groups, priorities, project labels, and due dates."
                sizes="(max-width: 600px) 900px, (max-width: 1280px) calc(100vw - 80px), 1200px"
                loading="eager"
                unoptimized
              />
            </div>
            <figcaption>
              <span>Actual product. Example workspace.</span>
              <a href={shotBoard.src} target="_blank" rel="noopener noreferrer">
                Open full size<span className="sr-only"> in a new tab</span>
                <Arrow />
              </a>
            </figcaption>
            <p className="home-scroll-hint">
              Swipe or scroll sideways to explore <span aria-hidden>↔</span>
            </p>
          </figure>
          <div className="home-essentials" aria-label="Workspace essentials">
            <p>
              <LineIcon path="m5 12 4 4L19 6" />
              <span>
                <strong>A clear next step</strong>Owners, priorities, and due dates
              </span>
            </p>
            <p>
              <LineIcon path="M4 5h16v12H9l-5 4zM8 9h8m-8 4h5" />
              <span>
                <strong>Context that stays close</strong>Comments, files, and subtasks
              </span>
            </p>
            <p>
              <LineIcon path="M4 18 9 12l4 3 7-10M15 5h5v5" />
              <span>
                <strong>Progress you can see</strong>Projects, timelines, and activity
              </span>
            </p>
          </div>
        </HomeSection>

        <HomeSection className="home-detail" labelledBy="detail-title">
          <div className="public-container home-detail-layout">
            <div className="home-detail-copy">
              <p className="home-overline">Everything that goes into getting it done</p>
              <h2 id="detail-title">
                More than a task.
                <br />
                The whole conversation.
              </h2>
              <p>
                The brief, the feedback, that file someone sent. Keep it all with the task, not
                scattered across your working day.
              </p>
              <ul>
                <li>
                  <span aria-hidden>✓</span>Break bigger work into smaller steps
                </li>
                <li>
                  <span aria-hidden>✓</span>Keep comments and replies in context
                </li>
                <li>
                  <span aria-hidden>✓</span>Find the files you need, where you need them
                </li>
              </ul>
              <Link href={startHref} className="public-button public-button-secondary">
                Give your next project a home
                <Arrow />
              </Link>
            </div>
            <figure className="home-detail-image">
              <a
                href={shotDrawer.src}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View the full task detail screenshot in a new tab"
              >
                <Image
                  src={shotDrawer}
                  alt="The full Mokara workspace with a task drawer showing its description, status, due date, and threaded comments."
                  sizes="(max-width: 900px) calc(100vw - 48px), 700px"
                  unoptimized
                />
              </a>
              <figcaption>
                <span>All the details. One place.</span>
                <a href={shotDrawer.src} target="_blank" rel="noopener noreferrer">
                  Open full size<span className="sr-only"> in a new tab</span>
                  <Arrow />
                </a>
              </figcaption>
            </figure>
          </div>
        </HomeSection>

        <HomeSection
          id="product"
          className="home-product public-container"
          labelledBy="product-title"
        >
          <div className="home-product-heading">
            <h2 id="product-title">A home for the work.</h2>
            <p>Tasks, people, and progress. Explore the workspace from every angle.</p>
          </div>
          <fieldset className="home-explorer">
            <legend className="sr-only">Choose a product screenshot</legend>
            {VIEWS.map((view, index) => (
              <input
                key={view.id}
                id={`view-${view.id}`}
                type="radio"
                name="product-view"
                className="sr-only home-view-control"
                defaultChecked={index === 0}
                aria-label={view.label}
              />
            ))}
            <div className="home-view-options">
              {VIEWS.map((view) => (
                <label key={view.id} htmlFor={`view-${view.id}`}>
                  {view.tab}
                </label>
              ))}
            </div>
            <div className="home-preview-stage">
              {VIEWS.map((view) => (
                <figure key={view.id} className={`home-preview home-preview-${view.id}`}>
                  <figcaption className="home-preview-copy">
                    <div className="home-view-name">
                      <LineIcon path={view.path} />
                      <span>{view.tab}</span>
                    </div>
                    <h3>{view.label}</h3>
                    <p>{view.description}</p>
                    <p className="home-preview-caption">{view.caption}</p>
                    <a
                      className="home-text-link"
                      href={view.image.src}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Explore this view<span className="sr-only"> full size in a new tab</span>
                      <Arrow />
                    </a>
                  </figcaption>
                  <div className="home-preview-media">
                    <div
                      className="home-preview-viewport"
                      role="region"
                      tabIndex={0}
                      aria-label={`${view.label} screenshot. Scroll horizontally on smaller screens.`}
                    >
                      <Image
                        src={view.image}
                        alt={view.alt}
                        sizes="(max-width: 600px) 780px, (max-width: 900px) calc(100vw - 48px), 700px"
                        unoptimized
                      />
                    </div>
                    <p className="home-scroll-hint">
                      Swipe or scroll sideways to explore <span aria-hidden>↔</span>
                    </p>
                  </div>
                </figure>
              ))}
            </div>
          </fieldset>
        </HomeSection>

        <HomeSection className="home-your-way public-container" labelledBy="your-way-title">
          <div className="home-your-way-heading">
            <p className="home-overline">A workspace that fits</p>
            <h2 id="your-way-title">Your team. Your way to work.</h2>
            <p>Just you, a few collaborators, or the whole team. Start with what you need.</p>
          </div>
          <div className="home-hosting-options">
            <article>
              <LineIcon path="M7 17H6a4 4 0 0 1-1-8 7 7 0 0 1 13-1 4.5 4.5 0 0 1 0 9h-1M12 20V11m-3 3 3-3 3 3" />
              <h3>Open a workspace. Get going.</h3>
              <p>
                Use Mokara hosted. Start free with up to three people per team, and choose a plan as
                your needs change.
              </p>
              <Link href="/pricing" className="home-text-link">
                Find your plan
                <Arrow />
              </Link>
            </article>
            <article>
              <LineIcon path="M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01" />
              <h3>Your server. Your setup.</h3>
              <p>
                Prefer to run things yourself? Self-host Mokara for free, without the hosted
                capacity caps.
              </p>
              <Link href="/pricing" className="home-text-link">
                Explore self-hosting
                <Arrow />
              </Link>
            </article>
          </div>
        </HomeSection>

        <HomeSection id="faq" className="home-faq public-container" labelledBy="faq-title">
          <div className="home-faq-heading">
            <p className="home-overline">Before you settle in</p>
            <h2 id="faq-title">A few good questions.</h2>
          </div>
          <div className="home-faq-list">
            {FAQS.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <span aria-hidden>+</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </HomeSection>
        <HomeSection className="home-closing" labelledBy="closing-title">
          <div className="public-container">
            <p className="home-overline">Make it happen, together</p>
            <h2 id="closing-title">Your next project starts here.</h2>
            <p>Bring your tasks, conversations, and team into one shared workspace.</p>
            <Link className="public-button public-button-primary" href={startHref}>
              {startLabel}
              <Arrow />
            </Link>
            <small>
              {hasSession ? "Pick up where you left off." : "Start free. No credit card required."}
            </small>
          </div>
        </HomeSection>
      </main>
      <SiteFooter />
    </div>
  );
}
function Arrow() {
  return (
    <svg
      className="home-arrow"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}
function LineIcon({ path }: { path: string }) {
  return (
    <svg
      className="home-line-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
