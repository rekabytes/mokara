import { getPublicMetadata, getWebsiteStructuredData } from "@/lib/seo.server";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AUTH_COOKIE } from "@/lib/cookies";
import shotDrawer from "../public/landing/shot-drawer.webp";
import { HomeField } from "./HomeField";
import { HomeSection } from "./HomeSection";
import { HomeWorkflow } from "./HomeWorkflow";
import { HomeProduct } from "./HomeProduct";
import { HomeDirectoryBadge } from "./HomeDirectoryBadge";
import { HomeProductHuntBadge } from "./HomeProductHuntBadge";
import "./homepage.css";

export function generateMetadata(): Metadata {
  return getPublicMetadata("/");
}
const questions = [
  {
    question: "Can I start on my own?",
    answer:
      "Yes. Start in a personal workspace, organize your tasks and bring your teammates into a shared workspace when you’re ready.",
  },
  {
    question: "Do I need an AI agent to use Mokara?",
    answer:
      "No. Tasks, projects, comments and progress work directly in Mokara. Connect an agent whenever it fits your workflow.",
  },
  {
    question: "What can my agent do?",
    answer:
      "With the permissions you approve, your agent can read and update work, create tasks, manage steps and comments, and publish or link GitHub issues in selected repositories. You can revoke the connection in Settings.",
  },
  {
    question: "Is it free to get started?",
    answer:
      "Yes. The Free plan includes the core task features and supports up to three people per team. No credit card is needed. See Pricing for the full plan limits.",
  },
];

export default async function LandingPage() {
  const structuredData = getWebsiteStructuredData();
  const hasSession = (await cookies()).has(AUTH_COOKIE);
  const startHref = hasSession ? "/tasks" : "/signup";
  const startLabel = hasSession ? "Open your workspace" : "Start your workspace";
  return (
    <div className="public-site homepage">
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
          }}
        />
      )}
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
            <div className="home-hero-copy">
              <Link href="/docs/mcp" className="home-announcement">
                <span className="home-announcement-dot" />
                Meet Mokara MCP<span aria-hidden>↗</span>
              </Link>
              <h1 id="hero-title">
                Good work.
                <br />
                <em>Less busywork.</em>
              </h1>
              <p className="home-intro">
                A shared place for your team to make things happen. Bring your tasks, conversations
                and AI agent together. Keep the work moving.
              </p>
              <div className="home-hero-action">
                <Link className="public-button public-button-primary" href={startHref}>
                  {startLabel}
                </Link>
                <HomeProductHuntBadge className="home-hero-badge" />
              </div>
              <p className="home-reassurance">
                {hasSession
                  ? "Pick up where you left off."
                  : "Free for up to 3 people per team. No credit card."}
              </p>
            </div>
            <HomeWorkflow />
          </HomeSection>
        </div>

        <div className="home-principles public-container" aria-label="Built around your work">
          <span>
            A little less friction.
            <br />
            <strong>A lot more flow.</strong>
          </span>
          <p>
            <span className="home-index">01</span>Plan with your team
          </p>
          <p>
            <span className="home-index">02</span>Act with your agent
          </p>
          <p>
            <span className="home-index">03</span>See what moves forward
          </p>
        </div>

        <HomeSection
          id="product"
          className="home-product public-container"
          labelledBy="product-title"
        >
          <div className="home-section-heading">
            <div>
              <p className="home-overline">01 / Your everyday workspace</p>
              <h2 id="product-title">
                A place for the work.
                <br />
                Room for the details.
              </h2>
            </div>
            <p>
              From the first idea to the last checkmark.
              <br />
              An overview when you need it.
              <br />
              The context when you don’t.
            </p>
          </div>
          <HomeProduct />
        </HomeSection>

        <HomeSection id="agents" className="home-agent-section" labelledBy="agent-title">
          <div className="public-container">
            <div className="home-section-heading">
              <div>
                <p className="home-overline">02 / Meet your new way to work</p>
                <h2 id="agent-title">
                  You set the direction.
                  <br />
                  <em>Your agent takes a step.</em>
                </h2>
              </div>
              <p>
                Already working with an AI agent? Give it a connection to Mokara. A conversation can
                become a task, an update or a linked GitHub issue.
              </p>
            </div>
            <div className="home-agent-layout">
              <div className="home-agent-quote">
                <span className="home-overline">From a request</span>
                <blockquote>
                  “Create a task for the onboarding review. Add two steps and publish a GitHub
                  issue.”
                </blockquote>
                <span className="home-quote-caption">An example of what you can ask</span>
              </div>
              <div className="home-agent-outcomes">
                <span className="home-overline">To something your team can work with</span>
                <div>
                  <span aria-hidden>✓</span>
                  <p>
                    One task in your workspace<small>With the details and steps together</small>
                  </p>
                </div>
                <div>
                  <span aria-hidden>↗</span>
                  <p>
                    A connected GitHub issue<small>In a repository you approved</small>
                  </p>
                </div>
                <div>
                  <span aria-hidden>○</span>
                  <p>
                    You stay in control<small>Choose permissions. Revoke access anytime.</small>
                  </p>
                </div>
                <Link href="/docs/mcp" className="home-agent-link">
                  Connect your AI agent <Arrow />
                </Link>
              </div>
            </div>
            <div className="home-agent-footnote">
              <p>
                <span className="home-index">41</span>tools for your agent, with access you choose
              </p>
              <Link href="/docs/mcp#skill">
                Get the Mokara skill <Arrow />
              </Link>
              <Link href="/docs/mcp#access">
                Explore the tools <Arrow />
              </Link>
            </div>
          </div>
        </HomeSection>

        <HomeSection className="home-context public-container" labelledBy="context-title">
          <div className="home-context-copy">
            <p className="home-overline">03 / Keep the whole story</p>
            <h2 id="context-title">
              The task is just
              <br />
              the beginning.
            </h2>
            <p>
              The brief. The feedback. The file that makes everything click. Give the work a home,
              and the conversation a place to stay.
            </p>
            <dl>
              <div>
                <dt>Break it down</dt>
                <dd>Turn a bigger task into smaller, useful steps.</dd>
              </div>
              <div>
                <dt>Talk it through</dt>
                <dd>Keep comments and replies with the work.</dd>
              </div>
              <div>
                <dt>Bring it together</dt>
                <dd>Files, priorities and due dates, all in reach.</dd>
              </div>
            </dl>
          </div>
          <figure className="home-context-media">
            <div className="home-context-image">
              <Image
                src={shotDrawer}
                alt="Mokara task drawer showing a description, status, due date and threaded comments beside the workspace."
                sizes="(max-width: 800px) calc(100vw - 40px), 65vw"
              />
            </div>
            <figcaption>
              Inside a task · Actual product, example workspace
              <a href={shotDrawer.src} target="_blank" rel="noopener noreferrer">
                Full view ↗<span className="sr-only"> in a new tab</span>
              </a>
            </figcaption>
          </figure>
        </HomeSection>

        <HomeDirectoryBadge />

        <HomeSection id="faq" className="home-faq public-container" labelledBy="faq-title">
          <div>
            <p className="home-overline">A few things to know</p>
            <h2 id="faq-title">
              Before you
              <br />
              get going.
            </h2>
            <Link href="/pricing" className="home-text-link">
              Find your plan <Arrow />
            </Link>
          </div>
          <div className="home-faq-list">
            {questions.map((item) => (
              <details key={item.question}>
                <summary>
                  {item.question}
                  <span aria-hidden>+</span>
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </HomeSection>

        <HomeSection className="home-closing public-container" labelledBy="closing-title">
          <div>
            <p className="home-overline">Make space for your next idea</p>
            <h2 id="closing-title">
              A fresh page.
              <br />
              <em>A shared next step.</em>
            </h2>
          </div>
          <div>
            <Link className="public-button public-button-primary" href={startHref}>
              {startLabel}
              <Arrow />
            </Link>
            <p>
              {hasSession
                ? "Your work is waiting for you."
                : "Start free. Bring your team when you’re ready."}
            </p>
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
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}
