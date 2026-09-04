#!/usr/bin/env node
// Seeds demo data for the landing-page screenshot against a RUNNING dev backend.
//
//   node scripts/seed-demo.mjs [baseUrl]      # default http://localhost:4700
//
// Creates (idempotent — safe to re-run):
//   3 users  mira / jonas / priya   (password: demo-password)
//   1 team   "Atlas Studio" (kind: team) with all 3 members
//   3 projects (team scope) + 3 KPIs (personal, mira's)
//   16 tasks across all four statuses, a few with KPI bindings, one flagged
//   2 comments on the first task
//
// Prints the demo owner's auth token last — the screenshot script needs it.

const BASE = process.argv[2] ?? "http://localhost:4700";
const PASSWORD = "demo-password";

const TEAM = "Atlas Studio";
const PROJECTS = [
  { name: "Website Redesign", color: "#6366f1", scope: "team" },
  { name: "Mobile App v2", color: "#0ea5e9", scope: "team" },
  { name: "Brand Refresh", color: "#f59e0b", scope: "team" },
];
const KPIS = ["On-time delivery", "Review turnaround", "Client satisfaction"];

async function call(path, { method = "GET", body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `mokara_token=${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data, setCookies: res.headers.getSetCookie() };
}

function tokenFrom(setCookies) {
  for (const c of setCookies ?? []) {
    const m = /mokara_token=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

async function signupOrLogin(username, displayName) {
  let r = await call("/api/auth/login", { method: "POST", body: { username, password: PASSWORD } });
  if (!r.ok) {
    r = await call("/api/auth/signup", {
      method: "POST",
      body: { username, password: PASSWORD, display_name: displayName },
    });
  }
  if (!r.ok) throw new Error(`signup/login ${username}: ${r.status} ${JSON.stringify(r.data)}`);
  const token = tokenFrom(r.setCookies);
  if (!token) throw new Error(`no cookie for ${username}`);
  console.log(`user  ${username} (${displayName})`);
  return token;
}

/** RFC3339 due date `days` from today, anchored at LOCAL NOON so a +08:00
 *  browser renders the intended calendar day (never derive days from UTC). */
function iso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

const mira = await signupOrLogin("mira", "Mira Tan");
const jonas = await signupOrLogin("jonas", "Jonas Weber");
const priya = await signupOrLogin("priya", "Priya Nair");

// ---- team -------------------------------------------------------------
let teams = (await call("/api/teams", { token: mira })).data?.teams ?? [];
let team = teams.find((t) => t.name === TEAM);
if (!team) {
  team = (
    await call("/api/teams", { method: "POST", token: mira, body: { name: TEAM, kind: "team" } })
  ).data?.team;
  console.log(`team  created "${TEAM}"`);
} else {
  console.log(`team  exists "${TEAM}"`);
}
const teamId = team.id;

// ---- members (cap is 3; skip anyone already in) ------------------------
// GET /teams/:id returns the TeamDetail BARE (no { team } wrapper).
const detail = (await call(`/api/teams/${teamId}`, { token: mira })).data ?? team;
const memberNames = new Set((detail.members ?? []).map((m) => m.username ?? m.user?.username));
for (const [username, token] of [
  ["jonas", jonas],
  ["priya", priya],
]) {
  if (memberNames.has(username)) {
    console.log(`member ${username} already in`);
    continue;
  }
  await call(`/api/teams/${teamId}/invitations`, {
    method: "POST",
    token: mira,
    body: { username },
  });
  const invs = (await call("/api/invitations", { token })).data?.invitations ?? [];
  const inv = invs.find(
    (i) =>
      i.status === "pending" &&
      (i.team_id === teamId || i.team?.id === teamId || i.team_name === TEAM)
  );
  if (!inv) throw new Error(`no pending invitation for ${username}`);
  const rr = await call(`/api/invitations/${inv.id}/respond`, {
    method: "POST",
    token,
    body: { action: "accept" },
  });
  if (!rr.ok) throw new Error(`accept for ${username}: ${rr.status} ${JSON.stringify(rr.data)}`);
  console.log(`member ${username} joined`);
}

// ---- projects + KPIs ---------------------------------------------------
const projectList =
  (await call(`/api/teams/${teamId}/projects`, { token: mira })).data?.projects ?? [];
const projects = {};
for (const p of PROJECTS) {
  const found = projectList.find((x) => x.name === p.name);
  projects[p.name] =
    found ??
    (
      await call(`/api/teams/${teamId}/projects`, {
        method: "POST",
        token: mira,
        body: p,
      })
    ).data?.project;
  console.log(`proj  ${p.name}${found ? " (exists)" : ""}`);
}

const kpiList = (await call(`/api/teams/${teamId}/kpis`, { token: mira })).data?.kpis ?? [];
const kpis = {};
for (const name of KPIS) {
  const found = kpiList.find((x) => x.name === name);
  kpis[name] =
    found ??
    (await call(`/api/teams/${teamId}/kpis`, { method: "POST", token: mira, body: { name } })).data
      ?.kpi;
  console.log(`kpi   ${name}${found ? " (exists)" : ""}`);
}

const k = (name, weight) => ({ kpi_id: kpis[name].id, weight });

// ---- tasks (only when the team has none yet) ---------------------------
// GET /teams/:id/tasks returns the task array BARE (no { tasks } wrapper).
const existing = (await call(`/api/teams/${teamId}/tasks`, { token: mira })).data ?? [];
let created = existing;
if (existing.length === 0) {
  const TASKS = [
    {
      title: "Audit design tokens across surfaces",
      status: "in_progress",
      priority: "high",
      due: 0,
      project: "Website Redesign",
      description:
        "Walk every screen, list hardcoded colors and radii, map each to the token it should read.",
      kpis: [k("Review turnaround", 60), k("Client satisfaction", 40)],
    },
    {
      title: "Implement OAuth sign-in flow",
      status: "in_progress",
      priority: "medium",
      due: 3,
      project: "Mobile App v2",
    },
    {
      title: "Q3 brand deck for review",
      status: "in_progress",
      priority: "low",
      due: 5,
      project: "Brand Refresh",
    },
    {
      title: "Migrate landing page to new tokens",
      status: "todo",
      priority: "medium",
      due: 2,
      project: "Website Redesign",
    },
    {
      title: "Fix flaky E2E suite on CI",
      status: "todo",
      priority: "high",
      due: -1,
      project: "Mobile App v2",
      kpis: [k("On-time delivery", 100)],
    },
    {
      title: "Set up crash reporting",
      status: "todo",
      priority: "medium",
      due: 4,
      project: "Mobile App v2",
    },
    {
      title: "Accessibility pass: contrast ratios",
      status: "todo",
      priority: "medium",
      due: 6,
      project: "Website Redesign",
      kpis: [k("Client satisfaction", 100)],
    },
    {
      title: "Write onboarding email sequence",
      status: "todo",
      priority: "low",
      due: 7,
      project: "Brand Refresh",
    },
    {
      title: "Spike: local-first sync",
      status: "todo",
      priority: "medium",
      due: 14,
      project: "Mobile App v2",
    },
    { title: "Refactor invitation accept flow", status: "todo", priority: "low", due: 8 },
    {
      title: "Ship color tokens v2",
      status: "done",
      priority: "medium",
      due: -3,
      project: "Website Redesign",
    },
    {
      title: "Interview five beta users",
      status: "done",
      priority: "high",
      due: -5,
      project: "Mobile App v2",
    },
    {
      title: "Update pricing page copy",
      status: "done",
      priority: "low",
      due: -2,
      project: "Website Redesign",
    },
    {
      title: "Fix iOS keyboard overlap",
      status: "done",
      priority: "medium",
      due: -4,
      project: "Mobile App v2",
    },
    { title: "Legacy IE11 polyfills", status: "canceled", priority: "low", due: null },
  ];

  for (const t of TASKS) {
    const body = {
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due === null ? null : iso(t.due),
      ...(t.project ? { project_id: projects[t.project].id } : {}),
      ...(t.kpis ? { kpis: t.kpis } : {}),
      ...(t.description ? { description: t.description } : {}),
    };
    const r = await call(`/api/teams/${teamId}/tasks`, { method: "POST", token: mira, body });
    if (!r.ok) throw new Error(`task "${t.title}": ${r.status} ${JSON.stringify(r.data)}`);
    created.push(r.data?.task ?? r.data);
  }
  console.log(`tasks ${created.length} created`);
} else {
  console.log(`tasks ${existing.length} already present — task seed skipped`);
}

// flag the overdue high-priority one (the endpoint is a TOGGLE — only call when off)
const flagged = created.find((t) => t.title === "Fix flaky E2E suite on CI");
if (flagged && !(flagged.flagged ?? flagged.is_flagged)) {
  const r = await call(`/api/tasks/${flagged.id}/flag`, { method: "POST", token: mira });
  console.log(`flag  ${r.ok ? "set" : `failed (${r.status})`}`);
} else {
  console.log(`flag  ${flagged ? "already set" : "task not found"}`);
}

// ---- comments on the audit task ---------------------------------------
const first = created.find((t) => t.title === "Audit design tokens across surfaces") ?? created[0];
const comments =
  (await call(`/api/tasks/${first.id}/comments`, { token: mira })).data?.comments ?? [];
if (comments.length === 0) {
  const c1 = await call(`/api/tasks/${first.id}/comments`, {
    method: "POST",
    token: jonas,
    body: {
      body: "Started the audit — color tokens are consistent, spacing still has hard-coded values in the drawer.",
    },
  });
  const c1id = c1.data?.comment?.id;
  await call(`/api/tasks/${first.id}/comments`, {
    method: "POST",
    token: mira,
    body: {
      body: "Agreed. Let's fix spacing right after the color pass, before the contrast work starts.",
      parent_id: c1id,
    },
  });
  console.log("comments 2 added");
} else {
  console.log(`comments ${comments.length} already present`);
}

console.log("\n--- screenshot credentials ---");
console.log(`TOKEN=${mira}`);
console.log(`TEAM_ID=${teamId}`);
