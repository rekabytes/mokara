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
    title: "Use selected GitHub repositories",
    description:
      "Read issues, publish task content to GitHub and link existing issues. Linking enables synchronization and may change the issue state.",
  },
] satisfies { scope: McpScope; title: string; description: string }[];
export type McpRepository = { id: string; name: string; private: boolean };
