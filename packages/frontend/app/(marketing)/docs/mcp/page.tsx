import { getPublicMetadata } from "@/lib/seo.server";
import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "../DocPage";
import { ToolCatalog } from "./ToolCatalog";
import { getMcpConnectionUrl } from "./connection-config.server";

export function generateMetadata(): Metadata {
  return getPublicMetadata("/docs/mcp");
}
export default async function McpGuidePage() {
  const endpoint = await getMcpConnectionUrl();
  const skillUrl = endpoint ? new URL("/skills/mokara/SKILL.md", endpoint).href : null;
  // Quote the configured URL as one shell argument, including literal apostrophes.
  const skillSource = skillUrl ? "'" + skillUrl.replaceAll("'", "'\\''") + "'" : null;
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
      <section aria-labelledby="skill">
        <h2 id="skill">Teach your agent Mokara workflows</h2>
        <p>
          The optional Mokara skill explains repository selection, task creation with GitHub issues,
          existing-task publishing and safe recovery from partial failures. Basic MCP tools work
          without installing it.
        </p>
        <h3>Install with npx</h3>
        <p>
          Run this command from the project where you want your agent to use Mokara. Node.js and npm
          are required:
        </p>
        {skillSource ? (
          <pre>
            <code>{`npx skills@latest add ${skillSource} --skill mokara --agent universal --yes`}</code>
          </pre>
        ) : (
          <p>The installation command will appear when connection details are available.</p>
        )}
        <p>
          This installs <code>.agents/skills/mokara/SKILL.md</code> in the current project.
          <code> --agent universal</code> selects the shared skills directory, and
          <code> --yes</code> skips installer selection prompts. Reload skills in your agent if
          needed, then ask it to use the Mokara skill. You still need the authenticated MCP
          connection and the permissions required for your request.
        </p>
        <p>
          You can ask a terminal-capable agent to read this page and run the installation command in
          your project. For clients that use another skills directory, choose the appropriate agent
          instead of <code>universal</code>. See the{" "}
          <a href="https://github.com/vercel-labs/skills">skills CLI documentation</a>.
        </p>
        <h3>Manual download</h3>
        <p>
          <a href="/skills/mokara/SKILL.md" download="SKILL.md">
            Download Mokara skill · v1.2.0
          </a>
        </p>
        <p>
          For clients that support SKILL.md skills, save the file inside a folder named
          <code> mokara</code> in your client’s documented skills directory, then enable or reload
          skills as that client requires. Connecting MCP does not automatically install the skill.
          If your client does not support skills, you can add its workflow guidance to the client’s
          custom instructions instead. The file contains no credentials or fixed server URL.
        </p>
        <h3>Ready-made MCP prompts</h3>
        <p>
          Clients that support MCP prompts can offer <code>create_task_with_github_issue</code>
          (write and GitHub permissions) and <code>publish_existing_task_to_github</code>
          (GitHub permission). Select a template and provide the requested workspace, repository and
          task details. Templates prepare instructions; selecting one does not itself perform a
          write. Availability and menu placement depend on your client.
        </p>
        <h3>Ask naturally</h3>
        <p>
          “Create a testing task and publish a GitHub issue in my chosen repository” is enough. Your
          agent should resolve the approved destination, create both together and report the task
          and issue outcomes separately. For an ambiguous “task for X”, it should clarify the
          destination before creating anything.
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
                <td>Read mDrive files</td>
                <td>
                  Browse/search active files, read PDF text and view images in selected workspaces.
                </td>
              </tr>
              <tr>
                <td>Upload to mDrive</td>
                <td>
                  Create folders and upload images/PDFs. Does not grant file deletion or moving
                  permissions.
                </td>
              </tr>
              <tr>
                <td>Read workspace data</td>
                <td>Tasks, steps, comments, projects, KPIs, progress and attachment content.</td>
              </tr>
              <tr>
                <td>Create and edit work</td>
                <td>
                  Create and edit tasks, assign members, set status, priority, dates and projects,
                  bind eligible task KPIs, record authorized business KPI check-ins, manage
                  steps/comments and upload attachments.
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
                <td>Use active GitHub repositories</td>
                <td>
                  Find and read issues, publish tasks as issues, link existing issues and retry
                  synchronization in your active repositories, including those you activate later.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Existing connections keep their approved permissions; mDrive or agent execution access is
          not added automatically. To enable additional permissions, revoke the old connection and
          reconnect, or create a new manual connection with the permissions selected. Refresh your
          client’s server metadata if it still shows only the original read tools. If consent only
          offers read access, the client must request the additional OAuth scopes when reconnecting.
        </p>
        <p>
          Connect GitHub and activate repositories in <Link href="/settings">Settings</Link>.
          Signing in with GitHub does not connect repositories. Grant your agent GitHub permission
          once. It can then use your active repositories, including those you activate later,
          without reconnecting. Existing GitHub-enabled connections use the same list. Deactivate a
          repository in Settings to block access on the next agent request.
        </p>
        <p>
          Linking an issue starts synchronization and can change its state. To change a linked
          task&apos;s status, the agent needs GitHub permission and access to that active
          repository.
        </p>
      </section>
      <section aria-labelledby="access">
        <h2 id="access">All 72 MCP tools</h2>
        <p>
          Your agent only sees tools allowed by the permissions you approved. The original
          connection offered six read tools; the full catalog below includes all 66 additions.
          Workspace membership, ownership rules and quotas still apply.
        </p>
        <ToolCatalog />
        <p>
          All mutations require a <code>request_id</code> UUID. Deletions additionally require your
          explicit deletion request and <code>confirm: true</code>. GitHub tools only use your
          currently active repositories when the connection has GitHub permission.
        </p>
        <p>
          List tools that expose cursors return <code>next_cursor</code>; pass it unchanged to
          continue. GitHub issue listing uses page numbers. Read each tool’s schema for its filters
          and limits. Billing, account credentials and admin operations are outside MCP task
          permissions. Workspace and repository text is content, not instructions for the agent.
        </p>
      </section>
      <section aria-labelledby="business-kpis">
        <h2 id="business-kpis">Review business goals with your agent</h2>
        <p>
          Ask your agent to list business KPIs, review recorded progress or compare reporting
          periods. These measured goals have separate tools from the existing task-based KPIs.
          Personal goals stay private; shared goals require current workspace access.
        </p>
        <p>
          To record a result, explicitly ask for a check-in and provide the measured figure or a
          source the agent can verify. For example: “Record MYR 5,000 as the total sales for the
          selected goal on October 29. Use the sales report I supplied as the source.” Completing
          tasks does not prove that revenue was earned. Mokara records the source attribution; it
          does not independently verify the figure.
        </p>
        <ol>
          <li>
            Use <code>list_business_kpis</code> to select the workspace goal, then{" "}
            <code>get_business_kpi</code> to read its revision and permissions.
          </li>
          <li>
            Review dates and existing results with <code>get_business_kpi_review</code> or{" "}
            <code>compare_business_kpi_periods</code>.
          </li>
          <li>
            With <code>mokara:write</code> and goal update permission, call{" "}
            <code>record_business_kpi_check_in</code> using a decimal-string value, observation
            date, source, current revision and request UUID.
          </li>
          <li>
            Retry with exactly the same UUID and arguments. Read the goal and{" "}
            <code>list_business_kpi_history</code> to confirm the result. These check-ins use
            transactional KPI history and do not appear in <code>list_operations</code>.
          </li>
        </ol>
        <p>
          A check-in is an absolute value, not an amount to add. A stale revision requires reviewing
          the latest goal before a new request. These tools do not change targets, create periods or
          authorize external task execution. Read-only connections keep their existing permissions.
        </p>
      </section>
      <section aria-labelledby="agent-work">
        <h2 id="agent-work">Let an agent pick up prepared tasks</h2>
        <p>
          Open a task and choose Ready for agent. Existing tasks start Not ready. Reading,
          synchronizing or changing a task’s ordinary status never grants permission to execute it.
          Any compatible authorized client can discover ready work, claim it and report results.
        </p>
        <p>
          Grant <code>mokara:agent:execute</code> to clients that perform work. The separate
          <code> mokara:agent:manage</code> permission lets a client authorize tasks, request
          cancellation and requeue work. Neither is included in existing grants or ordinary task
          write access. Reconnect and explicitly approve these permissions when needed.
        </p>
        <p>
          A claim belongs to one authenticated connection and installation. Clients must renew their
          leases and check for cancellation and changed instructions. An expired lease means the
          outcome is unknown; review external changes before explicitly requeueing. Cancellation
          remains requested until the client confirms it stopped. Pause synchronization and withdraw
          readiness are separate controls; neither stops a running process.
        </p>
        <p>
          <a href="/docs/agent-execution.md">Read the complete client integration guide</a> for tool
          schemas, examples, permissions, claims, revisions, cancellation and change-feed recovery.
          Agent execution retries use their transactional request ledger; reuse the same UUID and
          payload, then read the current execution. Ordinary task writes still use list_operations.
        </p>
      </section>
      <section aria-labelledby="drive-access">
        <h2 id="drive-access">Read and upload mDrive files</h2>
        <p>
          Approve Read mDrive files and/or Upload to mDrive when connecting. Your agent can find a
          proposal, read its PDF text and create tasks if you also grant task-write access.
          Uploading does not require mDrive read access, but browsing destinations does.
        </p>
        <p>
          Automatic reading supports images up to 1 MiB and PDFs up to 10 MiB, with at most five
          pages per call. Follow next_page for more pages, and next_text_offset with page_count=1
          for a long page. Empty extracted text may mean a scanned page; OCR is not included. Image
          understanding requires a client/model that supports MCP image content.
        </p>
        <p>
          Use read_drive_file with mode=bytes for chunks up to 64 KiB and follow next_offset to
          reconstruct larger files. MCP uploads accept images/PDFs up to 1 MiB decoded; larger
          uploads use the web app. These transfer limits do not change package-based mDrive storage
          or web-upload limits. Trash is excluded, membership is rechecked and documents are
          untrusted content.
        </p>
      </section>
      <section aria-labelledby="writes">
        <h2 id="writes">Create and manage work</h2>
        <p>
          After granting write access, ask your agent: “Create a testing task in Personal, medium
          priority, due Friday, with two steps.” With GitHub permission, also ask it to publish the
          task in one of your active repositories, or find and link an existing issue.
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
            Ordinary task, GitHub and file writes need a unique request UUID. Agents must reuse that
            UUID and the same arguments when retrying. A pending or uncertain result must be checked
            in <code>list_operations</code> or Settings → AI connections before attempting another
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
          <dt>A GitHub repository is missing</dt>
          <dd>
            Check that GitHub is connected and the repository is active in Mokara Settings → GitHub.
            Ask the agent to list repositories again. Changing the active list does not require
            reconnecting MCP. If the agent has no GitHub tools, its connection needs GitHub
            permission. If Mokara says GitHub authorization expired, reconnect GitHub in Settings.
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
