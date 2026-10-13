import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "../DocPage";
import { getMcpConnectionUrl } from "./connection-config.server";

export const metadata: Metadata = {
  title: "Connect an AI agent",
  description:
    "Connect a remote MCP client to Mokara with secure sign-in, selected workspace permissions and revocable permissions for reading, writing and selected GitHub repositories.",
};
export default async function McpGuidePage() {
  const endpoint = await getMcpConnectionUrl();
  return (
    <DocPage
      current="/docs/mcp"
      title="Your agent, connected."
      description="Give your AI agent a clear view of your work, with access you choose and control."
    >
      <section aria-labelledby="server">
        <h2 id="server">Add Mokara to your AI agent</h2>
        <p>Use this remote MCP server URL in your agent’s connector settings:</p>
        {endpoint ? (
          <pre>
            <code>{endpoint}</code>
          </pre>
        ) : (
          <div className="docs-note" role="alert">
            <p>
              Connection details are temporarily unavailable. Reload this page before setting up
              your agent.
            </p>
          </div>
        )}
        <div className="docs-table-wrap">
          <table>
            <caption>Mokara connection settings</caption>
            <tbody>
              <tr>
                <th scope="row">Server name</th>
                <td>Mokara</td>
              </tr>
              <tr>
                <th scope="row">Transport</th>
                <td>Streamable HTTP</td>
              </tr>
              <tr>
                <th scope="row">Authentication</th>
                <td>OAuth · Sign in with Mokara</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Connect the server, sign in and approve your workspaces. Mokara runs the service; you only
          add the connection to your agent. No server installation or environment file is needed.
        </p>
      </section>
      <section aria-labelledby="install">
        <h2 id="install">Install in your client</h2>
        <h3>Cursor</h3>
        <p>
          Open <code>~/.cursor/mcp.json</code> for a connection available across your projects. Add
          the Mokara entry to its <code>mcpServers</code> object, preserving existing servers:
        </p>
        {endpoint ? (
          <pre>
            <code>{JSON.stringify({ mcpServers: { mokara: { url: endpoint } } }, null, 2)}</code>
          </pre>
        ) : (
          <p>The installation configuration will appear when connection details are available.</p>
        )}
        <p>
          Enable Mokara in Cursor’s MCP settings and follow its sign-in prompt, then approve
          workspace access in Mokara. See{" "}
          <a href="https://cursor.com/docs/mcp">Cursor’s MCP instructions</a> for client-specific
          controls.
        </p>
        <h3>VS Code</h3>
        <p>
          Run <code>MCP: Open User Configuration</code> from the Command Palette. Add Mokara to the{" "}
          <code>servers</code> object in that file, preserving existing entries:
        </p>
        {endpoint ? (
          <pre>
            <code>
              {JSON.stringify({ servers: { mokara: { type: "http", url: endpoint } } }, null, 2)}
            </code>
          </pre>
        ) : (
          <p>The installation configuration will appear when connection details are available.</p>
        )}
        <p>
          Run <code>MCP: List Servers</code>, select Mokara and start the connection. Complete
          authentication when prompted. See{" "}
          <a href="https://code.visualstudio.com/docs/agent-customization/mcp-servers">
            VS Code’s MCP instructions
          </a>{" "}
          for client-specific controls.
        </p>
        <h3>Other AI agents</h3>
        <p>
          Add a remote MCP server using the URL and connection settings above. Configuration formats
          vary by client; use its remote HTTP connector rather than a local command.
        </p>
      </section>
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
          <li>Enter the Mokara server URL shown in the connection settings above.</li>
          <li>
            Choose the client’s connect or sign-in action. In the browser, sign in to Mokara with
            your username and password, Google or GitHub.
          </li>
          <li>
            Review the client name, client ID and return address. Client names are supplied by the
            agent and are not verified by Mokara.
          </li>
          <li>
            Select the workspaces you want to share and the permissions your agent needs, then
            choose <strong>Allow selected access</strong>. Writing, deletions and GitHub access are
            unchecked by default. No workspace is selected automatically; choose up to 20.
          </li>
          <li>
            Return to your agent and ask it to list your workspaces. With write permission, you can
            ask it to create a task, set its fields and add steps or comments.
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
      <section aria-labelledby="permissions">
        <h2 id="permissions">Choose what your agent can do</h2>
        <div className="docs-table-wrap">
          <table>
            <caption>Connection permissions</caption>
            <thead>
              <tr>
                <th scope="col">Permission</th>
                <th scope="col">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Read workspace data</td>
                <td>Tasks, steps, comments, projects, KPIs, progress and attachment content.</td>
              </tr>
              <tr>
                <td>Create and edit work</td>
                <td>
                  Create and edit tasks, assign members, set status, priority, dates and projects,
                  bind eligible KPIs, manage steps/comments and upload attachments.
                </td>
              </tr>
              <tr>
                <td>Allow deletions</td>
                <td>
                  Delete eligible tasks, steps, comments, projects, KPIs and files when you
                  explicitly request it. Existing ownership rules apply.
                </td>
              </tr>
              <tr>
                <td>Use selected GitHub repositories</td>
                <td>
                  Find and read issues, publish tasks as issues, link existing issues and retry
                  synchronization in specifically approved repositories.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Existing connections stay read-only. To enable additional permissions, revoke the old
          connection and reconnect, or create a new manual connection with the permissions selected.
          Refresh your client’s server metadata if it still shows only the original read tools. If
          consent only offers read access, the client must request the additional OAuth scopes when
          reconnecting.
        </p>
        <p>
          For GitHub, first connect the repository integration and enable repositories in
          <Link href="/settings"> Settings</Link>. GitHub sign-in alone does not connect
          repositories. Select the repositories again when authorizing your agent. Linking an
          existing issue enables synchronization and may change its state; changing a linked task’s
          status also requires permission for its approved GitHub repository.
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
          The original six list tools are paginated, with up to 50 items per request. Additional
          tools provide complete task details, attachments, KPIs, analytics and write activity.
          Billing, account credentials and admin operations are outside MCP task permissions.
          Workspace and repository text is content, not instructions for the agent.
        </p>
      </section>
      <section aria-labelledby="writes">
        <h2 id="writes">Create and manage work</h2>
        <p>
          After granting write access, ask your agent: “Create a testing task in Personal, medium
          priority, due Friday, with two steps.” With GitHub permission, also ask it to publish the
          task in one of your approved repositories, or find and link an existing issue.
        </p>
        <p>
          Task creation supports title, description, status, priority, due date, assignee, project,
          eligible KPI bindings and steps. Your agent can also edit projects, KPIs and comments
          using the same ownership rules as the web app.
        </p>
        <p>
          If a task is created but GitHub publishing or another follow-up fails, the agent receives
          the task ID and the follow-up failures. Inspect that task and retry the specific failed
          action instead of creating another task.
        </p>
        <div className="docs-note">
          <p>
            Every write needs a unique request UUID. Agents must reuse that UUID and the same
            arguments when retrying. A pending or uncertain result must be checked in{" "}
            <code>list_operations</code> or Settings → AI connections before attempting another
            write.
          </p>
        </div>
        <p>
          Attachment uploads through MCP accept images and PDFs up to 1 MiB, subject to workspace
          quotas. Read attachment content in base64 chunks of up to 64 KiB using
          <code> read_attachment</code> and its returned <code>next_offset</code>. Larger uploads
          use the web app. Reads have response limits; an oversized response returns an explicit
          error.
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
            Check that the server URL matches the connection settings above and that your client
            supports the connection methods listed above. Contact Mokara support if the error
            persists.
          </dd>
        </dl>
      </section>
    </DocPage>
  );
}
