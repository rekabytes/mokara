export const MCP_SCOPES = [
  "mokara:read",
  "mokara:write",
  "mokara:delete",
  "mokara:github",
  "mokara:drive:read",
  "mokara:drive:upload",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export const MCP_PERMISSIONS = [
  {
    scope: "mokara:drive:read",
    title: "Read mDrive files",
    description:
      "Browse and search folders, read PDF text, and view images in selected workspaces. File contents may contain private team information.",
  },
  {
    scope: "mokara:drive:upload",
    title: "Upload to mDrive",
    description:
      "Create folders and upload images or PDFs to selected workspaces using the owner’s shared storage. Does not permit moving or deleting files.",
  },
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
    title: "Use active GitHub repositories",
    description:
      "Access your active repositories, including those activated later, without reconnecting. Read issues, publish tasks and link issues; linking may change issue state.",
  },
] satisfies { scope: McpScope; title: string; description: string }[];
