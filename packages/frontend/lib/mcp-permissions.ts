export const MCP_SCOPES = [
  "mokara:read",
  "mokara:write",
  "mokara:delete",
  "mokara:github",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export const MCP_PERMISSIONS = [
  {
    scope: "mokara:read",
    title: "Read workspace data",
    description:
      "Read tasks, steps, comments, projects, KPIs, progress and attachments in selected workspaces.",
  },
  {
    scope: "mokara:write",
    title: "Create and edit work",
    description:
      "Create and edit tasks, steps, comments, projects and KPIs; assign tasks, set dates and upload attachments. Existing ownership rules still apply.",
  },
  {
    scope: "mokara:delete",
    title: "Allow deletions",
    description:
      "Delete tasks and eligible steps, comments, projects, KPIs and attachments when you explicitly ask the agent to do so.",
  },
  {
    scope: "mokara:github",
    title: "Use selected GitHub repositories",
    description:
      "Read issues, publish task content to GitHub and link existing issues. Linking enables synchronization and may change the issue state.",
  },
] satisfies { scope: McpScope; title: string; description: string }[];
export type McpRepository = { id: string; name: string; private: boolean };
