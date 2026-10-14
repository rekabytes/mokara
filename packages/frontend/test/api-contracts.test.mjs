import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../lib/api.ts";
import { asBoardTask } from "../app/(app)/tasks/task-format.ts";
import { toMe, toTask, toTeam, toComment, toProject, toKpi } from "../../backend/src/lib/types.ts";

const date = new Date("2026-10-11T00:00:00Z");
const user = toMe({
  id: "u",
  username: "kai",
  displayName: null,
  createdAt: date,
  passwordHash: null,
  usernameClaimed: false,
  tourState: null,
  tourResolvedAt: null,
});
const task = toTask({
  id: "t",
  teamId: "w",
  title: "Task",
  description: null,
  status: "todo",
  priority: "medium",
  projectId: null,
  dueDate: null,
  flagged: false,
  createdAt: date,
  updatedAt: date,
});
const team = toTeam(
  {
    id: "w",
    name: "Workspace",
    slug: "workspace",
    ownerId: "u",
    kind: "workspace",
    logoKey: null,
    createdAt: date,
  },
  1,
  null
);
const comment = toComment({
  id: "c",
  taskId: "t",
  authorId: "u",
  author: { id: "u", username: "kai", displayName: null, createdAt: date },
  parentId: null,
  body: "Comment",
  createdAt: date,
  updatedAt: date,
});
const project = toProject({
  id: "p",
  teamId: "w",
  ownerId: "u",
  owner: { username: "kai" },
  scope: "team",
  name: "Project",
  color: null,
  archived: false,
  createdAt: date,
  updatedAt: date,
});
const kpi = toKpi({
  id: "k",
  teamId: "w",
  ownerId: "u",
  owner: { username: "kai" },
  name: "KPI",
  createdAt: date,
  updatedAt: date,
});
const invitation = {
  id: "i",
  team_id: "w",
  inviter_id: "u",
  invitee_username: "friend",
  status: "pending",
  created_at: date.toISOString(),
  expires_at: date.toISOString(),
  responded_at: null,
};
const caps = { members: null, teams: null, storage_bytes: null, file_bytes: null };
const integration = {
  configured: false,
  sync_configured: false,
  repository_limit: 3,
  connection: null,
};
const githubIssue = {
  status: "creating",
  repository_id: "r",
  repository_full_name: "org/repo",
  issue_number: null,
  issue_url: null,
  created_by_user_id: null,
  last_error_code: null,
  sync_status: "idle",
  sync_error_code: null,
  last_synced_at: null,
};
const attachment = {
  id: "a",
  task_id: null,
  filename: "file.pdf",
  size_bytes: 1,
  content_type: "application/pdf",
  uploader: { id: "u", username: "kai", display_name: null },
  created_at: date.toISOString(),
};
const subtask = { id: "s", title: "Step", done: false, position: 0 };
const url = { url: "https://github.com/login/oauth/authorize?state=test" };
const mcpConnection = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Agent",
  workspace_ids: ["22222222-2222-4222-8222-222222222222"],
  created_at: date.toISOString(),
  expires_at: date.toISOString(),
  revoked_at: null,
  access: "read",
  scopes: ["mokara:read"],
  repository_ids: [],
};
const libraryFolder = {
  id: "f",
  parent_id: null,
  name: "Project",
  creator_name: "Kai",
  created_at: date.toISOString(),
  trashed_at: null,
  can_manage: true,
};
const libraryFile = {
  id: "file",
  folder_id: null,
  name: "Plan.pdf",
  uploader_name: "Kai",
  size_bytes: 100,
  content_type: "application/pdf",
  created_at: date.toISOString(),
  trashed_at: null,
  can_manage: true,
};
const cases = [
  [
    "listFiles",
    ["w"],
    {
      files: [libraryFile],
      folders: [libraryFolder],
      total: 1,
      page: 1,
      page_size: 40,
      role: "owner",
      storage_configured: true,
      trash_days: 30,
      usage: {
        account_used_bytes: 100,
        account_limit_bytes: 1024,
        workspace_used_bytes: 100,
        file_limit_bytes: 500,
      },
    },
  ],
  ["createFolder", ["w", "Project", null], { folder: libraryFolder }],
  ["updateFolder", ["w", "f", { name: "Project" }], { folder: libraryFolder }],
  ["updateFile", ["w", "file", { name: "Plan.pdf" }], { file: libraryFile }],
  ["manageFileItem", ["w", "files", "file", "trash"], { ok: true }],
  ["listMcpRepositories", [], { repositories: [] }],
  ["listMcpActivity", [], { activity: [] }],
  [
    "mcpConsent",
    ["request"],
    {
      client: {
        id: mcpConnection.id,
        name: "Agent",
        redirect_uri: "https://agent.example/callback",
      },
      scope: "mokara:read",
      requested_scopes: ["mokara:read"],
      repositories: [],
      expires_in_days: 30,
      workspaces: [{ id: mcpConnection.workspace_ids[0], name: "Workspace" }],
    },
  ],
  [
    "approveMcp",
    [{ request: "request", approve: true, workspace_ids: mcpConnection.workspace_ids }],
    { url: "http://127.0.0.1:5000/callback?code=test" },
  ],
  ["listMcpConnections", [], { connections: [mcpConnection] }],
  [
    "createMcpConnection",
    [{ name: "Agent", workspace_ids: mcpConnection.workspace_ids, expires_in_days: 30 }],
    { connection: mcpConnection, token: `mk_mcp_${"a".repeat(43)}` },
  ],
  ["revokeMcpConnection", [mcpConnection.id], undefined],
  ["socialProviders", [], { providers: [{ provider: "google", enabled: true }] }],
  ["socialConnections", [], { connections: [] }],
  ["startSocial", ["google", { intent: "login" }], url],
  ["claimUsername", ["kai"], { user }],
  ["pendingSocial", [], { provider: "google", email: "user@example.com", display_name: "Kai" }],
  ["completeSocial", [{}], { user, redirect: "/tasks" }],
  ["signupProtection", [], { required: false, site_key: null }],
  ["signUp", [{ username: "kai", password: "example" }], { user }],
  ["login", [{ username: "kai", password: "example" }], { user }],
  ["logout", [], undefined],
  ["listNotifications", [], { notifications: [], unread_count: 0 }],
  ["markNotificationsRead", [null], { marked: 1 }],
  ["changePassword", [{}], undefined],
  ["revokeAllSessions", [], undefined],
  [
    "listSessions",
    [],
    {
      sessions: [
        { id: "session", device: "Browser", created_at: "now", last_seen_at: "now", current: true },
      ],
    },
  ],
  ["revokeSession", ["session"], undefined],
  ["updateMe", [{ display_name: null }], { user }],
  ["me", [], { user }],
  ["patchTourState", ["skipped"], undefined],
  [
    "getBilling",
    [],
    {
      plan: "free",
      billing_configured: false,
      checkout_configured: false,
      has_subscription: false,
      period_end: null,
      grace_until: null,
      caps,
      plans: { free: caps },
    },
  ],
  ["startCheckout", ["w"], url],
  ["billingPortal", [], url],
  ["syncBilling", [], undefined],
  ["getGitHubIntegration", [], integration],
  ["connectGitHub", [], url],
  ["installGitHub", [], url],
  ["refreshGitHub", [], url],
  ["disconnectGitHub", [], undefined],
  ["setGitHubRepositories", [[]], integration],
  ["retryGitHubSync", ["t"], task],
  ["publishGitHubIssue", ["t", "r"], { github_issue: githubIssue }],
  ["createTeam", [{ name: "Workspace" }], { team }],
  ["listTeams", [], { teams: [{ ...team, role: "owner" }], last_container_id: null }],
  ["setLastContainer", ["w"], undefined],
  [
    "getTeam",
    ["w"],
    {
      team,
      role: "owner",
      members: [
        { user_id: "u", username: "kai", display_name: null, role: "owner", joined_at: "now" },
      ],
      invitations: [invitation],
    },
  ],
  ["leaveTeam", ["w"], undefined],
  ["inviteToTeam", ["w", { username: "friend" }], { invitation }],
  ["listInvitations", [], { invitations: [invitation] }],
  [
    "respondToInvitation",
    ["i", "accept"],
    { invitation_id: "i", status: "accepted", team_id: "w" },
  ],
  ["getTask", ["t"], task],
  ["listTeamTasks", ["w"], [task]],
  ["createTeamTask", ["w", { title: "Task" }], task],
  ["listProjects", ["w"], { projects: [project] }],
  ["createProject", ["w", { name: "Project" }], { project }],
  ["updateProject", ["p", {}], { project }],
  ["deleteProject", ["p"], undefined],
  ["listKpis", ["w"], { kpis: [kpi] }],
  ["createKpi", ["w", { name: "KPI" }], { kpi }],
  ["updateKpi", ["k", {}], { kpi }],
  ["deleteKpi", ["k"], undefined],
  ["getKpiProgress", ["w"], { kpis: [] }],
  ["setTaskKpis", ["t", []], task],
  ["updateTask", ["t", {}], task],
  ["deleteTask", ["t"], undefined],
  ["flagTask", ["t"], task],
  ["listComments", ["t"], { comments: [comment] }],
  ["createComment", ["t", "Comment"], { comment }],
  ["updateComment", ["c", "Comment"], { comment }],
  ["deleteComment", ["c"], undefined],
  ["createSubtask", ["t", "Step"], { subtask }],
  ["updateSubtask", ["s", {}], { subtask }],
  ["deleteSubtask", ["s"], undefined],
  ["orderSubtasks", ["t", ["s"]], undefined],
  ["listAttachments", ["t"], { attachments: [attachment] }],
  ["deleteAttachment", ["a"], undefined],
  ["listCommentAttachments", ["c"], { attachments: [attachment] }],
  ["setTeamLogo", ["w", new File(["file"], "logo.png")], { team }],
  ["removeTeamLogo", ["w"], { team }],
  [
    "getAnalytics",
    ["w", 30],
    { range: 30, series: [], totals: { open: 0, in_progress: 0, completed: 0, canceled: 0 } },
  ],
  [
    "getProgress",
    ["w"],
    {
      tasks: [
        {
          id: "t",
          title: "Task",
          status: "todo",
          created_at: "now",
          started_at: null,
          due_date: "later",
          completed_at: null,
          due_changes: [],
        },
      ],
    },
  ],
];

test("every JSON RPC rejects malformed success bodies and accepts its backend response contract", async (t) => {
  let response;
  t.mock.method(globalThis, "fetch", async () =>
    response === undefined ? new Response(null, { status: 204 }) : Response.json(response)
  );
  const excluded = new Set([
    "uploadWorkspaceFile",
    "workspaceFileUrl",
    "attachmentDownloadUrl",
    "teamLogoUrl",
    "uploadAttachment",
    "uploadCommentAttachment",
  ]);
  assert.deepEqual(
    new Set(cases.map(([name]) => name)),
    new Set(Object.keys(api).filter((name) => !excluded.has(name)))
  );
  for (const [name, args, valid] of cases) {
    response = { unexpected: true };
    await assert.rejects(
      () => api[name](...args),
      (error) => error.error === "invalid_response" && error.status === 502,
      name
    );
    response = valid;
    assert.deepEqual(await api[name](...args), valid, name);
  }
});

test("referenced project deletion accepts the archive response as successful void", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ project: { ...project, archived: true, task_count: 1 } })
  );
  assert.equal(await api.deleteProject("p"), undefined);
});

test("missing task/session response cannot be accepted as a successful 204", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  await assert.rejects(api.getTask("t"), (error) => error.error === "invalid_response");
  await assert.rejects(
    api.login({ username: "kai", password: "example" }),
    (error) => error.error === "invalid_response"
  );
});

test("nested corruption and unsafe navigation targets never reach UI state", async (t) => {
  const invalid = [
    [() => api.getTask("t"), { ...task, subtasks: [{ ...subtask, done: "false" }] }],
    [() => api.getTask("t"), { ...task, status: "unknown" }],
    [() => api.getBilling(), { plan: "free", caps: { members: "unlimited" } }],
    [() => api.connectGitHub(), { url: "javascript:alert(1)" }],
    [() => api.completeSocial({}), { user, redirect: "//external.example" }],
    [() => api.completeSocial({}), { user, redirect: "/\\external.example" }],
    [() => api.signupProtection(), { required: true, site_key: null }],
  ];
  let body;
  t.mock.method(globalThis, "fetch", async () => Response.json(body));
  for (const [call, value] of invalid) {
    body = value;
    await assert.rejects(call, (error) => error.error === "invalid_response");
  }
  assert.deepEqual(asBoardTask(task), task);
  assert.equal(asBoardTask({ ...task, assignee: { id: "u" } }), null);
  assert.equal(asBoardTask({ ...task, subtasks: [{}] }), null);
});

test("account storage usage validates its scope and byte count while accepting older billing responses", async (t) => {
  const legacy = cases.find(([name]) => name === "getBilling")[2];
  let response = legacy;
  t.mock.method(globalThis, "fetch", async () => Response.json(response));
  assert.equal((await api.getBilling()).storage, undefined);
  response = { ...legacy, storage: { scope: "account", used_bytes: 0 } };
  assert.deepEqual((await api.getBilling()).storage, { scope: "account", used_bytes: 0 });
  for (const storage of [
    { scope: "workspace", used_bytes: 0 },
    { scope: "account", used_bytes: -1 },
    { scope: "account", used_bytes: "100" },
    { scope: "account" },
  ]) {
    response = { ...legacy, storage };
    await assert.rejects(api.getBilling(), (error) => error.error === "invalid_response");
  }
});
