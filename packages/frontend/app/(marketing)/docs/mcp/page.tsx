import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "../DocPage";

export const metadata: Metadata = {
  title: "Connect an AI agent",
  description:
    "Connect a remote MCP client to Mokara with secure sign-in, selected workspace permissions and revocable read-only access.",
};
export default function McpGuidePage() {
  return (
    <DocPage
      current="/docs/mcp"
      title="Your agent, connected."
      description="Give your AI agent a clear view of your work, with access you choose and control."
    >
      <section aria-labelledby="before">
        <h2 id="before">Before you connect</h2>
        <p>
          You need a Mokara account, at least one workspace and an agent that supports remote MCP
          over Streamable HTTP. For browser sign-in, the client also needs OAuth authorization code,
          PKCE S256 and dynamic client registration.
        </p>
        <p>
          If your client only accepts an Authorization header, use the manual token option below.
        </p>
      </section>
      <section aria-labelledby="sign-in">
        <h2 id="sign-in">Connect with Mokara sign-in</h2>
        <ol>
          <li>Open your agent’s MCP or connector settings and add a remote server.</li>
          <li>
            Use your Mokara site address followed by <code>/api/mcp</code>. For example, an instance
            at <code>https://mokara.example</code> uses <code>https://mokara.example/api/mcp</code>.
            Replace the example domain with the site you use.
          </li>
          <li>
            Choose the client’s connect or sign-in action. In the browser, sign in to Mokara with
            your username and password, Google or GitHub.
          </li>
          <li>
            Review the client name, client ID and return address. Client names are supplied by the
            agent and are not verified by Mokara.
          </li>
          <li>
            Select the workspaces you want to share, then choose <strong>Allow read access</strong>.
            No workspace is selected automatically. You can select up to 20.
          </li>
          <li>
            Return to your agent and ask it to list your workspaces, then read tasks from one of
            them.
          </li>
        </ol>
        <div className="docs-note">
          <p>
            Approve only a connection you started. Choose <strong>Deny</strong> if you don’t
            recognize the client or return address.
          </p>
        </div>
        <p>
          Browser consent requests expire after 10 minutes. If yours expires while signing in, start
          a new connection from the agent.
        </p>
      </section>
      <section aria-labelledby="access">
        <h2 id="access">What the agent can read</h2>
        <div className="docs-table-wrap">
          <table>
            <caption>Available read-only MCP tools</caption>
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">Access</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>list_workspaces</code>
                </td>
                <td>Approved workspaces you still belong to.</td>
              </tr>
              <tr>
                <td>
                  <code>list_tasks</code>
                </td>
                <td>Task summaries, with optional search and filters.</td>
              </tr>
              <tr>
                <td>
                  <code>get_task</code>
                </td>
                <td>A task’s details, including its description.</td>
              </tr>
              <tr>
                <td>
                  <code>list_projects</code>
                </td>
                <td>Projects in an approved workspace.</td>
              </tr>
              <tr>
                <td>
                  <code>list_members</code>
                </td>
                <td>Member names, IDs and roles; no emails or login details.</td>
              </tr>
              <tr>
                <td>
                  <code>list_comments</code>
                </td>
                <td>A task’s comments and replies.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          List results are paginated, with up to 50 items per request. Agents cannot read attachment
          contents, billing or admin data through these tools. Task and comment text is workspace
          content, not instructions for the agent.
        </p>
      </section>
      <section aria-labelledby="manual">
        <h2 id="manual">Connect with a manual token</h2>
        <ol>
          <li>
            Open <Link href="/settings">Settings → AI connections</Link> and find{" "}
            <strong>Manual token connection</strong>.
          </li>
          <li>Name the connection, select workspaces and choose an expiry of 7, 30 or 90 days.</li>
          <li>
            Create the connection. Save the token in your agent’s secret settings; Mokara shows it
            once.
          </li>
          <li>
            Use the same <code>/api/mcp</code> server URL and configure this header:
          </li>
        </ol>
        <pre>
          <code>{"Authorization: Bearer <your-issued-token>"}</code>
        </pre>
        <p>
          Keep the token out of prompts, URLs and shared files. If you lose it, revoke that
          connection and create another. If creation ends with an uncertain network error, refresh
          the list and revoke the uncertain entry before retrying.
        </p>
      </section>
      <section aria-labelledby="revoke">
        <h2 id="revoke">Expiry and revocation</h2>
        <p>
          Sign-in connections last up to 30 days. Access tokens last up to 15 minutes and the client
          refreshes them within that grant. After 30 days, reconnect and approve access again.
        </p>
        <p>
          Open <Link href="/settings">Settings → AI connections</Link> and choose{" "}
          <strong>Revoke</strong> beside a connection to remove its access. Leaving a workspace also
          blocks subsequent reads of that workspace. Requests already authorized may finish.
        </p>
      </section>
      <section aria-labelledby="trouble">
        <h2 id="trouble">If something doesn’t connect</h2>
        <dl className="docs-faq">
          <dt>The agent never opens sign-in</dt>
          <dd>
            Check that it supports remote Streamable HTTP and the OAuth features listed above.
            Otherwise, try a manual token.
          </dd>
          <dt>The connection request expired</dt>
          <dd>Start again from the agent and complete sign-in and consent in the same browser.</dd>
          <dt>A workspace is missing or denied</dt>
          <dd>
            Check that you still belong to it and approved it for this connection. To change the
            selection, revoke and reconnect.
          </dd>
          <dt>The client reports an origin or discovery error</dt>
          <dd>
            Ask your instance operator to check the{" "}
            <Link href="/docs/mcp/configuration">MCP configuration guide</Link>.
          </dd>
        </dl>
      </section>
    </DocPage>
  );
}
