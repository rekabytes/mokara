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
function shell(opts: { title: string; view: string; dataUserId?: string }): string {
  const userIdAttr = opts.dataUserId === undefined ? "" : ` data-user-id="${esc(opts.dataUserId)}"`;
  return `<!doctype html>
<html lang="en">
<head>
${HEAD}
<title>${esc(opts.title)}</title>
</head>
<body>
<header class="topbar">
<span class="mark">Mokara admin</span>
<nav>
<a href="/users">Users</a>
<form method="post" action="/logout"><button type="submit" class="signout">Sign out</button></form>
</nav>
</header>
<main id="app" data-view="${esc(opts.view)}"${userIdAttr}>
<p id="notice" class="notice" role="status"></p>
<section id="content"><p class="muted">Loading…</p></section>
</main>
<script src="/assets/admin.js" defer></script>
</body>
</html>`;
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
