// The console's HTML. Hand-built strings on purpose: this app has no framework
// and no build step, and three small pages do not justify one. Every dynamic
// value goes through esc() — including the ones inside quoted attributes, where
// React's escaping would not be there to save us.

/** Escape for text and double-quoted attribute contexts. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const HEAD = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="/assets/admin.css">`;

/**
 * The login form. Rendered only for a correct `?key=`, and the key travels back
 * in a hidden field so the POST can be verified again — server-side here and by
 * the backend, which never trusts this app's opinion of it.
 *
 * A plain form POST (no fetch): a failure re-renders this page with the message,
 * which keeps JavaScript out of the one flow that must work with JS disabled.
 */
export function loginPage(key: string, error?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
<title>Mokara admin — sign in</title>
</head>
<body class="login-body">
<main class="login-card">
<h1>Mokara admin</h1>
<p class="muted">Operator console</p>
${error === undefined ? "" : `<p class="error" role="alert">${esc(error)}</p>`}
<form method="post" action="/login">
<input type="hidden" name="url_key" value="${esc(key)}">
<label>Username
<input name="username" autocomplete="username" maxlength="100" required>
</label>
<label>Password
<input name="password" type="password" autocomplete="current-password" maxlength="200" required>
</label>
<button type="submit">Sign in</button>
</form>
<p class="muted small">Sessions last 8 hours.</p>
</main>
</body>
</html>`;
}

/**
 * The shell both data pages share. All content is rendered by /assets/admin.js
 * from the proxied API — the server renders nothing user-derived, so there is no
 * second place for the same data to be escaped wrong.
 */
function shell(opts: {
  title: string;
  view: string;
  dataUserId?: string;
  dataWorkspaceId?: string;
}): string {
  const userIdAttr = opts.dataUserId === undefined ? "" : ` data-user-id="${esc(opts.dataUserId)}"`;
  const section =
    opts.view === "user" ? "users" : opts.view === "workspace" ? "workspaces" : opts.view;
  const descriptions: Record<string, [string, string]> = {
    overview: [
      "Overview",
      "A clear picture of your platform, with the issues that need you first.",
    ],
    attention: [
      "Needs attention",
      "Inspect delayed operations and retries without changing product data.",
    ],
    users: ["Users", "Account context, integration health and operator grants."],
    user: ["Account details", "Understand this account and the workspaces it owns."],
    workspaces: ["Workspaces", "Owners, members and capacity — without private task content."],
    workspace: [
      "Workspace details",
      "Membership, plan limits and integration health in one place.",
    ],
    billing: [
      "Billing",
      "Provider observations, grants and reconciliation history, clearly separated.",
    ],
    audit: ["Audit trail", "Trace operator changes with searchable, durable records."],
  };
  const [heading, description] = descriptions[opts.view] ?? [
    "Administration",
    "Platform support and operations.",
  ];
  const navLink = (view: string, label: string, path: string) =>
    `<a href="/${view}"${section === view ? ` class="nav-active"${opts.view === view ? ' aria-current="page"' : ""}` : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="${path}" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${label}</span></a>`;
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
<title>${esc(opts.title)}</title>
</head>
<body>
<a class="skip-link" href="#app">Skip to content</a>
<aside class="sidebar">
<a class="brand" href="/overview"><span class="brand-symbol">M</span><span>Mokara<span class="brand-caption">Administration</span></span></a>
<nav aria-label="Administration">
<div class="nav-group"><p class="nav-label">Operations</p>
${navLink("overview", "Overview", "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z")}
${navLink("attention", "Needs attention", "M12 3 2 21h20L12 3Z M12 9v5 M12 17v.1")}</div>
<div class="nav-group"><p class="nav-label">Accounts &amp; support</p>
${navLink("users", "Users", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75")}
${navLink("workspaces", "Workspaces", "M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3")}
${navLink("billing", "Billing", "M3 5h18v14H3z M3 10h18 M7 15h3")}</div>
<div class="nav-group"><p class="nav-label">Governance</p>
${navLink("audit", "Audit trail", "M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4")}</div>
</nav>
<div class="sidebar-footer"><span class="operator-label">Operator console</span><form method="post" action="/logout"><button type="submit" class="signout">Sign out</button></form></div>
</aside>
<main id="app" tabindex="-1" aria-labelledby="page-title" data-view="${esc(opts.view)}"${userIdAttr}${opts.dataWorkspaceId === undefined ? "" : ` data-workspace-id="${esc(opts.dataWorkspaceId)}"`}>
<header class="page-header"><div><p class="eyebrow">Mokara / Administration</p><h1 id="page-title">${esc(heading)}</h1><p class="page-description">${esc(description)}</p></div><span class="context-tag">Operator access</span></header>
<p id="notice" class="notice" role="status"></p>
<section id="content"><p class="muted">Loading…</p></section>
</main>
<script src="/assets/admin.js" defer></script>
</body>
</html>`;
}

export function overviewPage(): string {
  return shell({ title: "Mokara admin — overview", view: "overview" });
}

export function attentionPage(): string {
  return shell({ title: "Mokara admin — needs attention", view: "attention" });
}

export function auditPage(): string {
  return shell({ title: "Mokara admin — audit", view: "audit" });
}

export function workspacesPage(): string {
  return shell({ title: "Mokara admin — workspaces", view: "workspaces" });
}
export function workspacePage(id: string): string {
  return shell({ title: "Mokara admin — workspace", view: "workspace", dataWorkspaceId: id });
}
export function billingPage(): string {
  return shell({ title: "Mokara admin — billing", view: "billing" });
}

export function usersPage(): string {
  return shell({ title: "Mokara admin — users", view: "users" });
}

export function userPage(id: string): string {
  return shell({ title: "Mokara admin — user", view: "user", dataUserId: id });
}

/**
 * Where logout lands. Not a redirect to /login: without its key that route is a
 * plain 404, so the operator would click "Sign out" and be told the console does
 * not exist. This says what actually happened and what to do next — and it does
 * NOT contain the key, because a page that leaked it would defeat the point of
 * carrying it in the URL.
 */
export function signedOutPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
<title>Mokara admin — signed out</title>
</head>
<body class="login-body">
<main class="login-card">
<h1>Signed out</h1>
<p class="muted">The console cookie is cleared. Reopen the admin login URL — the one carrying its <code>?key=</code> — to sign in again.</p>
</main>
</body>
</html>`;
}
