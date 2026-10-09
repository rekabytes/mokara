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
import "./homepage.css";

export const metadata: Metadata = {
  title: "Mokara — clearer task and project tracking for small teams",
  description:
    "Keep tasks, deadlines, and project progress in one shared workspace. Mokara helps small teams see what needs doing and keep work moving.",
  openGraph: {
    title: "Mokara — your team's work, clearly in view",
    description: "Tasks, deadlines, and project progress in one shared workspace for small teams.",
    images: ["/landing/og.jpg"],
  },
};

const VIEWS = [
  {
    id: "tasks",
    label: "Tasks",
    image: shotBoard,
    alt: "Mokara task board with task groups, priorities, project labels, and due dates.",
    caption: "Give the work a clear place to live, with priorities and deadlines in view.",
  },
  {
    id: "projects",
    label: "Projects",
    image: shotTeam,
    alt: "Mokara team workspace with project progress, team members, and personal KPIs.",
    caption: "Keep projects, people, and progress connected in your team's workspace.",
  },
  {
    id: "progress",
    label: "Progress",
    image: shotAnalytics,
    alt: "Mokara progress heatmap showing task timelines and deadlines.",
    caption: "See each task's progress against its deadline, not just a list of things to do.",
  },
];

const BENEFITS = [
  {
    title: "Make responsibility clear.",
    body: "Give a task an owner and a priority. Help people see what needs doing, and who is taking it forward.",
    detail: "Task assignment · Priorities · Shared workspaces",
    path: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 5 5",
  },
  {
    title: "Keep deadlines in sight.",
    body: "Focus on today, look ahead to the week, and get in-app reminders when a due date is approaching.",
    detail: "Due dates · Today / this week · Reminders",
    path: "M8 3v4m8-4v4M4 10h16M8 15h3M7 5h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z",
  },
  {
    title: "See the work moving.",
    body: "Follow project progress and task activity. See what's getting done, without assembling another update.",
    detail: "Projects · Progress heatmap · Activity analytics",
    path: "M4 4v16h16M8 15l4-5 4 3 4-7",
  },
];

export default async function LandingPage() {
  const hasSession = (await cookies()).has(AUTH_COOKIE);
  const startHref = hasSession ? "/tasks" : "/signup";
  const startLabel = hasSession ? "Open your workspace" : "Start free";

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
        <section className="home-hero public-container" aria-labelledby="hero-title">
          <p className="home-eyebrow">Task and project tracking for small teams</p>
          <h1 id="hero-title">
            Your team’s work.
            <br />
            <span>Clearly in view.</span>
          </h1>
          <p className="home-lede">
            Keep tasks, deadlines, and project progress in one shared workspace. A clearer picture
            for the people doing the work—and the people keeping it on track.
          </p>
          <div className="home-actions">
            <Link href={startHref} className="public-button public-button-primary">
              {startLabel} <Arrow />
            </Link>
            <a href="#product" className="public-button public-button-secondary">
              See Mokara in action
            </a>
          </div>
          <p className="home-reassurance">
            {hasSession
              ? "Your shared workspace is ready when you are."
              : "No credit card required · Built for small teams"}
          </p>
        </section>

        <section
          id="product"
          className="home-product public-container"
          aria-label="Mokara product screenshots"
        >
          <fieldset className="home-showcase">
            <legend className="sr-only">Choose a Mokara screenshot to preview</legend>
            {VIEWS.map((view, index) => (
              <input
                key={view.id}
                type="radio"
                name="product-view"
                id={`view-${view.id}`}
                className="sr-only home-view-control"
                defaultChecked={index === 0}
                aria-label={`${view.label} preview`}
              />
            ))}
            <div className="home-showcase-heading">
              <p>A closer look at Mokara</p>
              <div className="home-view-options">
                {VIEWS.map((view) => (
                  <label key={view.id} htmlFor={`view-${view.id}`}>
                    {view.label}
                  </label>
                ))}
              </div>
              <span>Actual product screenshots</span>
            </div>
            <div className="home-showcase-stage">
              {VIEWS.map((view, index) => (
                <figure key={view.id} className={`home-preview home-preview-${view.id}`}>
                  <a
                    href={view.image.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${view.label.toLowerCase()} screenshot full size (opens a new tab)`}
                  >
                    <Image
                      src={view.image}
                      alt={view.alt}
                      sizes="(max-width: 600px) calc(100vw - 48px), (max-width: 1224px) calc(100vw - 96px), 1128px"
                      loading={index === 0 ? "eager" : "lazy"}
                      unoptimized
                    />
                    <span className="home-enlarge">
                      View full size <Arrow />
                    </span>
                  </a>
                  <figcaption>{view.caption}</figcaption>
                </figure>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="home-benefits public-container" aria-labelledby="benefits-title">
          <div className="home-section-heading">
            <p className="home-eyebrow">Less coordinating. More moving forward.</p>
            <h2 id="benefits-title">
              A shared plan.
              <br />A clearer working day.
            </h2>
            <p>
              The essentials your team needs to make progress, without making the process the
              biggest task of all.
            </p>
          </div>
          <div className="home-benefit-grid">
            {BENEFITS.map((benefit) => (
              <article key={benefit.title} className="home-benefit">
                <svg
                  className="home-feature-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d={benefit.path} />
                </svg>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
                <small>{benefit.detail}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="home-context" aria-labelledby="context-title">
          <div className="public-container home-context-layout">
            <div className="home-context-copy">
              <p className="home-eyebrow">Keep the context with the task</p>
              <h2 id="context-title">
                Less searching.
                <br />
                More getting it done.
              </h2>
              <p>
                The conversation, the details, and the work itself shouldn’t live in three different
                places. Open a task and keep the discussion right beside it.
              </p>
              <ul>
                <li>Comments and replies stay with the task</li>
                <li>Checklists break the work into smaller steps</li>
                <li>Attachments keep useful files within reach</li>
              </ul>
              <a href="#product" className="home-text-link">
                Take a closer look at Mokara <Arrow />
              </a>
            </div>
            <figure className="home-context-image">
              <a
                href={shotDrawer.src}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View task detail screenshot full size (opens a new tab)"
              >
                <Image
                  src={shotDrawer}
                  alt="Mokara task drawer showing the description, status, priority, due date, and threaded comments."
                  sizes="(max-width: 600px) calc(100vw - 60px), (max-width: 1224px) 50vw, 600px"
                  unoptimized
                />
                <span className="home-enlarge">
                  View full size <Arrow />
                </span>
              </a>
              <figcaption>Task details and discussion, together.</figcaption>
            </figure>
          </div>
        </section>

        <section id="faq" className="home-faq public-container" aria-labelledby="faq-title">
          <div className="home-faq-heading">
            <p className="home-eyebrow">Before you get started</p>
            <h2 id="faq-title">
              A few things
              <br />
              worth knowing.
            </h2>
            <p>Straight answers to the questions a small team is likely to ask first.</p>
          </div>
          <div className="home-faq-list">
            <details>
              <summary>Is Mokara for teams or individuals?</summary>
              <p>
                Both. Organise your own tasks in a personal workspace, or bring teammates into a
                shared workspace. Mokara focuses on small teams who need a clear way to manage tasks
                and projects together.
              </p>
            </details>
            <details>
              <summary>Can we try it for free?</summary>
              <p>
                Yes. The Free plan supports up to three people per team and includes the core task
                features. You don’t need a credit card to create an account. See{" "}
                <Link href="/pricing">Pricing</Link> for all plans and capacity limits.
              </p>
            </details>
            <details>
              <summary>How do I bring in my team?</summary>
              <p>
                Your teammates create an account, then you invite them by username from the Team
                page. When the first invitation is accepted, your workspace becomes a team and the
                work is shared.
              </p>
            </details>
            <details>
              <summary>Can we run it on our own server?</summary>
              <p>
                Yes. Self-hosting is available for free, without the hosted capacity caps. You
                manage your own infrastructure and data. If you’d rather not manage a server, use
                the hosted service.
              </p>
            </details>
          </div>
        </section>

        <section className="home-closing public-container" aria-labelledby="closing-title">
          <div>
            <p className="home-eyebrow">Give everyone a clear next step</p>
            <h2 id="closing-title">
              Bring your team’s work
              <br />
              into clearer view.
            </h2>
            <p>
              Start with one project. Add the next task.
              <br />
              Give your team a shared place to move forward.
            </p>
            <Link href={startHref} className="public-button public-button-light">
              {hasSession ? "Open your workspace" : "Start your workspace for free"} <Arrow />
            </Link>
            {!hasSession && <small>No credit card required.</small>}
          </div>
        </section>
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
