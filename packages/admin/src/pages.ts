// The console's HTML. Hand-built strings on purpose: this app has no framework
// and no build step, so a framework adds no value here. Every dynamic
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
<link rel="preload" href="/assets/fonts/instrument-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/admin.css">`;

const BRAND_SYMBOL = `<span class="brand-symbol"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 18V6l8 9 8-9v12" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const LOGIN_BRAND = `<header class="login-brand"><div class="brand">${BRAND_SYMBOL}<span>Mokara<span class="brand-caption">Administration</span></span></div></header>`;

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
${LOGIN_BRAND}
<main class="login-card">
<p class="auth-eyebrow">Operator access / 01</p>
<h1>Welcome back.</h1>
<p>Enter your operator credentials to continue.</p>
${error === undefined ? "" : `<p class="error" role="alert">${esc(error)}</p>`}
<form method="post" action="/login">
<input type="hidden" name="url_key" value="${esc(key)}">
<label>Username
<input name="username" autocomplete="username" maxlength="100" required>
</label>
<label>Password
<input name="password" type="password" autocomplete="current-password" maxlength="200" required>
</label>
<button type="submit" class="btn btn-primary">Sign in</button>
</form>
<p class="muted small">Sessions last 8 hours.</p>
</main>
<p class="login-footer">Mokara administration · Authorized operators only</p>
</body>
</html>`;
}

/**
 * The shell all authenticated data pages share. All content is rendered by /assets/admin.js
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
  const headings: Record<string, string> = {
    overview: "Overview",
    attention: "Needs attention",
    users: "Users",
    user: "Account details",
    workspaces: "Workspaces",
    workspace: "Workspace details",
    billing: "Billing",
    audit: "Audit trail",
  };
  const heading = headings[opts.view] ?? "Administration";
  const sectionNumbers: Record<string, string> = {
    overview: "01",
    attention: "02",
    users: "03",
    workspaces: "04",
    billing: "05",
    audit: "06",
  };
  const navLink = (view: string, label: string) =>
    `<a href="/${view}"${section === view ? ` class="nav-active"${opts.view === view ? ' aria-current="page"' : ""}` : ""}><span class="nav-number" aria-hidden="true">${sectionNumbers[view]}</span><span>${label}</span><span class="nav-arrow" aria-hidden="true">↗</span></a>`;
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
<title>${esc(opts.title)}</title>
</head>
<body>
<a class="skip-link" href="#app">Skip to content</a>
<header class="console-header"><div class="console-header-inner">
<a class="brand" href="/overview">${BRAND_SYMBOL}<span>Mokara</span></a><span class="masthead-label">Administration</span>
<div class="console-account"><span class="operator-label">Operator console</span><form method="post" action="/logout"><button type="submit" class="signout">Sign out <span aria-hidden="true">↗</span></button></form></div>
</div></header>
<div class="console-layout">
<aside class="console-index"><p class="index-label">Console index</p><nav class="console-nav" aria-label="Administration">
<div class="nav-group"><p class="nav-label">Operations</p>
${navLink("overview", "Overview")}
${navLink("attention", "Needs attention")}</div>
<div class="nav-group"><p class="nav-label">Accounts &amp; support</p>
${navLink("users", "Users")}
${navLink("workspaces", "Workspaces")}
${navLink("billing", "Billing")}</div>
<div class="nav-group"><p class="nav-label">Governance</p>
${navLink("audit", "Audit trail")}</div>
</nav><div class="index-footer"><span class="index-line" aria-hidden="true"></span><span>Mokara<br>Administration</span></div></aside>
<main id="app" tabindex="-1" aria-labelledby="page-title" data-view="${esc(opts.view)}"${userIdAttr}${opts.dataWorkspaceId === undefined ? "" : ` data-workspace-id="${esc(opts.dataWorkspaceId)}"`}>
<header class="page-header"><div><p class="page-eyebrow"><span aria-hidden="true">${sectionNumbers[section]}</span> / ${section === "audit" ? "Governance" : ["overview", "attention"].includes(section) ? "Operations" : "Accounts &amp; support"}</p><h1 id="page-title">${esc(heading)}</h1></div><span class="page-register" aria-hidden="true">M / ${sectionNumbers[section]}</span></header>
<p id="notice" class="notice" role="status"></p>
<section id="content"><div class="load-state"><span class="loading-indicator" aria-hidden="true"></span><span>Loading…</span></div></section>
</main>
</div>
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
${LOGIN_BRAND}
<main class="login-card">
<p class="auth-eyebrow">Session closed</p>
<h1>Signed out.</h1>
<p class="muted">The console cookie is cleared. Reopen the admin login URL — the one carrying its <code>?key=</code> — to sign in again.</p>
</main>
<p class="login-footer">Mokara administration · Authorized operators only</p>
</body>
</html>`;
}
