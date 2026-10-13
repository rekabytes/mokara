import { getPublicMetadata } from "@/lib/seo.server";
import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "./DocPage";

export function generateMetadata(): Metadata {
  return getPublicMetadata("/docs");
}
export default function DocumentationPage() {
  return (
    <DocPage
      current="/docs"
      title="A little guidance."
      description="Practical guides for connecting your tools and keeping control of your workspace."
    >
      <section aria-labelledby="start">
        <h2 id="start">Start with your agent</h2>
        <p>
          Mokara’s Model Context Protocol (MCP) connection lets a compatible AI agent read your
          tasks, projects, members and comments, then create or update work when you grant write
          access. You choose the permissions and workspaces.
        </p>
        <div className="docs-guide-list">
          <Link href="/docs/mcp" className="docs-guide">
            <span className="docs-label">01 · For workspace members</span>
            <h3>
              Connect an AI agent <span aria-hidden="true">↗</span>
            </h3>
            <p>
              Sign in with Mokara, approve specific workspaces and remove access when you’re
              finished.
            </p>
            <span className="docs-guide-action">Read the connection guide →</span>
          </Link>
          <Link href="/docs/mcp#revoke" className="docs-guide">
            <span className="docs-label">02 · Stay in control</span>
            <h3>
              Manage agent access <span aria-hidden="true">↗</span>
            </h3>
            <p>
              Understand connection expiry and remove an agent’s workspace access whenever you need
              to.
            </p>
            <span className="docs-guide-action">Learn about expiry and revocation →</span>
          </Link>
        </div>
      </section>
      <section aria-labelledby="control">
        <h2 id="control">Your workspace, your access</h2>
        <p>
          Connections expire and start with read access. You can explicitly enable task writes,
          deletions and access to selected GitHub repositories. Existing read-only connections do
          not gain new permissions automatically. Normal workspace membership and ownership rules
          still apply.
        </p>
        <p>
          Review or revoke an existing connection in{" "}
          <Link href="/settings">Settings → AI connections</Link>. Signing in to Mokara does not
          grant an agent access automatically.
        </p>
      </section>
    </DocPage>
  );
}
