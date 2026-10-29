const groups = [
  {
    title: "mDrive read · 4 tools",
    scope: "mokara:drive:read",
    tools: [
      ["list_drive_items", "Browse active files and folders with separate pagination."],
      ["search_drive_items", "Search file/folder names across an approved workspace."],
      ["get_drive_file", "Read file metadata, uploader, type and size."],
      ["read_drive_file", "Read PDF text by page, view images, or retrieve bounded byte chunks."],
    ],
  },
  {
    title: "mDrive upload · 2 tools",
    scope: "mokara:drive:upload",
    tools: [
      ["create_drive_folder", "Create a folder, optionally inside another folder."],
      [
        "upload_drive_file",
        "Upload an image or PDF up to 1 MiB using base64 and a stable request UUID.",
      ],
    ],
  },
  {
    title: "Read · 15 tools",
    scope: "mokara:read",
    tools: [
      ["list_workspaces", "List approved workspaces you still belong to."],
      ["list_tasks", "List task summaries with search and filters."],
      ["get_task", "Read a task’s description, creator and assignee."],
      ["get_task_details", "Read steps, KPI bindings, attachment metadata and the GitHub link."],
      ["list_projects", "List projects, optionally including archived ones."],
      ["get_project", "Read a project and its tasks."],
      ["list_members", "List member names, IDs and roles, without emails or credentials."],
      ["list_comments", "Read a task’s comments and replies."],
      ["list_kpis", "List task-based KPIs and ownership. Business goals have separate tools."],
      ["get_kpi_progress", "Read weighted KPI progress."],
      ["get_workspace_progress", "Read workspace task progress."],
      ["get_analytics", "Read workspace analytics for a chosen day range."],
      ["list_attachments", "List task or comment attachment metadata."],
      ["read_attachment", "Read attachment content in base64 chunks up to 64 KiB."],
      ["list_operations", "Inspect this connection’s write activity and uncertain outcomes."],
    ],
  },
  {
    title: "Create and edit · 14 tools",
    scope: "mokara:write",
    tools: [
      [
        "create_task",
        "Create a task with optional steps and GitHub publishing. Publishing also needs GitHub permission and an approved repository.",
      ],
      [
        "update_task",
        "Edit task fields. Status changes on linked issues also need permission for the GitHub repository.",
      ],
      ["flag_task", "Toggle a task’s flag."],
      ["add_step", "Add a task step."],
      ["update_step", "Edit or complete a step."],
      ["reorder_steps", "Change task step order."],
      ["add_comment", "Add a comment or reply."],
      ["update_comment", "Edit a comment under normal ownership rules."],
      ["create_project", "Create a project."],
      ["update_project", "Edit a project."],
      ["create_kpi", "Create a task-based KPI, not a measured business goal."],
      ["update_kpi", "Edit a task-based KPI."],
      ["set_task_kpis", "Replace your KPI bindings on a task, respecting weight limits."],
      ["upload_attachment", "Upload an image or PDF up to 1 MiB to a task or comment."],
    ],
  },
  {
    title: "Delete · 6 tools",
    scope: "mokara:delete",
    tools: [
      ["delete_task", "Delete a task."],
      ["delete_step", "Delete a task step."],
      ["delete_comment", "Delete an eligible comment."],
      ["delete_project", "Delete a project; referenced projects follow normal archive behavior."],
      ["delete_kpi", "Delete an eligible KPI."],
      ["delete_attachment", "Delete an eligible attachment."],
    ],
  },
  {
    title: "GitHub · 6 tools",
    scope: "mokara:github",
    tools: [
      ["list_github_repositories", "List explicitly approved, currently accessible repositories."],
      ["list_github_issues", "List repository issues, excluding pull requests."],
      ["get_github_issue", "Read an issue by number."],
      ["publish_github_issue", "Create a GitHub issue from an existing Mokara task."],
      [
        "link_github_issue",
        "Link an existing issue to a task and enable synchronization, which may update issue state.",
      ],
      ["retry_github_sync", "Retry synchronization for a task’s linked issue."],
    ],
  },
  {
    title: "Business KPI reads · 5 tools",
    scope: "mokara:read",
    tools: [
      ["list_business_kpis", "List accessible measured goals, targets, dates and revisions."],
      ["get_business_kpi", "Read one goal's definition, latest result and current permissions."],
      ["get_business_kpi_review", "Read dated observations for a goal's trend review."],
      ["list_business_kpi_history", "Read original check-ins, source notes and immutable history."],
      ["compare_business_kpi_periods", "Compare a goal with its linked previous and next periods."],
    ],
  },
  {
    title: "Business KPI check-ins · 1 tool",
    scope: "mokara:write",
    tools: [
      [
        "record_business_kpi_check_in",
        "Record a requested absolute result with its observation date, source and expected revision. Existing goal permissions apply.",
      ],
    ],
  },
  {
    title: "Agent execution reads · 7 tools",
    scope: "mokara:read",
    tools: [
      ["get_agent_execution_capabilities", "Discover readiness, lease and synchronization rules."],
      ["list_ready_agent_tasks", "Discover explicitly ready tasks in a workspace or project."],
      ["get_agent_task", "Read full instructions, readiness, revision and current execution."],
      [
        "read_agent_task_snapshot",
        "Read large current instructions in revision-checked JSON chunks.",
      ],
      ["list_agent_task_changes", "Read the durable task and execution change feed."],
      ["list_agent_execution_history", "Read execution history, newest first."],
      ["read_agent_execution_snapshot", "Read immutable accepted instructions in JSON chunks."],
    ],
  },
  {
    title: "Authorize agent work · 4 tools",
    scope: "mokara:agent:manage",
    tools: [
      ["set_task_agent_readiness", "Explicitly authorize work or withdraw readiness."],
      ["set_task_agent_sync_paused", "Pause discovery without stopping an external process."],
      [
        "requeue_agent_task",
        "Explicitly authorize a new run after reviewing the previous outcome.",
      ],
      ["request_agent_execution_cancellation", "Request cancellation; wait for confirmation."],
    ],
  },
  {
    title: "Execute agent work · 8 tools",
    scope: "mokara:agent:execute",
    tools: [
      ["claim_agent_task", "Atomically claim one ready task for this connection and installation."],
      [
        "start_agent_execution",
        "Start a claimed execution after reading its accepted instructions.",
      ],
      ["renew_agent_execution_lease", "Renew ownership before the server-time lease expires."],
      ["report_agent_execution_progress", "Report progress without renewing the lease."],
      ["complete_agent_execution", "Save results without changing ordinary task status."],
      ["fail_agent_execution", "Record failure without automatically retrying work."],
      ["acknowledge_agent_execution_cancellation", "Confirm the external process has stopped."],
      ["release_agent_execution", "Release a claim; started work becomes an unknown outcome."],
    ],
  },
] as const;

export function ToolCatalog() {
  return groups.map((group) => (
    <div key={group.title}>
      <h3>{group.title}</h3>
      <p>
        Required permission: <code>{group.scope}</code>.
      </p>
      <div className="docs-table-wrap">
        <table>
          <caption>{group.title}</caption>
          <thead>
            <tr>
              <th scope="col">Tool</th>
              <th scope="col">What it does</th>
            </tr>
          </thead>
          <tbody>
            {group.tools.map(([name, description]) => (
              <tr key={name}>
                <td>
                  <code>{name}</code>
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ));
}
