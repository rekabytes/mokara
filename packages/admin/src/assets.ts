// The console's CSS and JS, held as strings and served from memory.
//
// Not files on disk on purpose: `serveStatic` resolves its root against the
// process cwd, which is packages/admin in dev (`pnpm --filter … dev`) and /app
// in the container — the same asset would need two different roots. In-memory
// serving is cwd-independent, needs no static middleware, and keeps the CSP
// fully closed (script-src/style-src 'self', no inline anything).

export const ADMIN_CSS = `
:root {
  color-scheme: dark;
  --bg: #0b0d10;
  --panel: #12161b;
  --line: #232a32;
  --text: #e8edf2;
  --muted: #93a0ad;
  --accent: #7cc4a4;
  --danger: #e08a7a;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 0.9rem/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.mark { font-weight: 600; letter-spacing: 0.01em; }

.topbar nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.85rem;
}

.topbar nav a:hover { color: var(--text); }

.topbar nav { display: flex; align-items: center; gap: 1rem; }

.topbar nav form { margin: 0; }

.signout {
  padding: 0.25rem 0.7rem;
  background: transparent;
  color: var(--muted);
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
}

.signout:hover { color: var(--text); border-color: var(--muted); }

main#app { max-width: 68rem; margin: 0 auto; padding: 1.25rem; }

.notice { min-height: 1.4rem; margin: 0 0 0.9rem; color: var(--muted); font-size: 0.82rem; }

.muted { color: var(--muted); }
.small { font-size: 0.78rem; }
.error { color: var(--danger); margin: 0 0 0.75rem; }

table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); }

th, td { padding: 0.55rem 0.7rem; text-align: left; border-bottom: 1px solid var(--line); }

th { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }

tbody tr:last-child td { border-bottom: 0; }

td a { color: var(--accent); text-decoration: none; }
td a:hover { text-decoration: underline; }

.badge {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 0.74rem;
  color: var(--muted);
}

.badge-starter { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.badge-pro { color: #9fc3e8; border-color: #2c3d4d; }
.badge-ultra { color: #d9b8e8; border-color: #3d3346; }

.badge-grant { color: #e3c98f; border-color: #4a4130; }

.plan-cell { display: inline-flex; align-items: center; gap: 0.35rem; }

.card { background: var(--panel); border: 1px solid var(--line); padding: 1rem 1.1rem; margin-bottom: 1rem; }

.card h1 { margin: 0 0 0.2rem; font-size: 1.25rem; }

.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.5rem 1.25rem; margin: 0.75rem 0 0; padding: 0; }

.facts div { min-width: 0; }
.facts dt { color: var(--muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; }
.facts dd { margin: 0.1rem 0 0; }

h2 { font-size: 0.95rem; margin: 1.4rem 0 0.6rem; }

.plan-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }

.plan-btn {
  padding: 0.4rem 0.9rem;
  background: transparent;
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
}

.plan-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

.plan-btn:disabled { opacity: 0.45; cursor: default; }

.back { display: inline-block; margin-bottom: 0.9rem; color: var(--muted); text-decoration: none; font-size: 0.84rem; }
.back:hover { color: var(--text); }

.login-body { display: grid; place-items: center; min-height: 100dvh; padding: 1.25rem; }

.login-card { width: min(22rem, 100%); background: var(--panel); border: 1px solid var(--line); padding: 1.5rem; }

.login-card h1 { margin: 0; font-size: 1.2rem; }

.login-card form { display: grid; gap: 0.8rem; margin-top: 1rem; }

.login-card label { display: grid; gap: 0.3rem; font-size: 0.8rem; color: var(--muted); }

.login-card input {
  padding: 0.5rem 0.6rem;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  color: var(--text);
  font: inherit;
}

.login-card input:focus { outline: 1px solid var(--accent); outline-offset: 1px; }

.login-card button {
  margin-top: 0.2rem;
  padding: 0.55rem 0.8rem;
  background: var(--accent);
  color: #08110c;
  border: 0;
  border-radius: 0.35rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
`;

export const ADMIN_JS = `
(() => {
  "use strict";

  const PLAN_IDS = ["free", "starter", "pro", "ultra"];
  const EXPIRED = "Session expired — reopen the admin login URL (with its key) to sign in again.";

  const app = document.getElementById("app");
  const noticeEl = document.getElementById("notice");
  const content = document.getElementById("content");

  function setNotice(message) {
    noticeEl.textContent = message;
  }

  // Everything is built with createElement + textContent: no innerHTML anywhere,
  // so a username or workspace name can never become markup.
  function badge(plan) {
    const span = document.createElement("span");
    span.className = "badge badge-" + plan;
    span.textContent = plan;
    return span;
  }

  function grantBadge() {
    const span = document.createElement("span");
    span.className = "badge badge-grant";
    span.textContent = "granted";
    span.title = "Operator grant — not a Stripe subscription";
    return span;
  }

  // The list shows the tier the account actually gets, plus a marker when an
  // operator granted it rather than a payment did.
  function planCell(user) {
    const wrap = document.createElement("span");
    wrap.className = "plan-cell";
    wrap.append(badge(String(user.plan)));
    if (user.plan_override !== null && user.plan_override !== undefined) wrap.append(grantBadge());
    return wrap;
  }

  function table(headers, rows) {
    const el = document.createElement("table");
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of headers) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      headRow.append(th);
    }
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    for (const cells of rows) {
      const tr = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        if (typeof cell === "string") td.textContent = cell;
        else td.append(cell);
        tr.append(td);
      }
      tbody.append(tr);
    }
    el.append(thead, tbody);
    return el;
  }

  function link(href, text) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    return a;
  }

  function fact(label, value) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrap.append(dt, dd);
    return wrap;
  }

  function when(iso) {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? "—" : at.toLocaleString();
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (res.status === 401) {
      setNotice(EXPIRED);
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message =
        body && typeof body.message === "string" ? body.message : "request failed (" + res.status + ")";
      setNotice(message);
      throw new Error(message);
    }
    return res.json();
  }

  async function loadUsers() {
    content.textContent = "Loading users…";
    let data;
    try {
      data = await getJSON("/api/users");
    } catch {
      content.textContent = "";
      return;
    }
    const users = Array.isArray(data.users) ? data.users : [];
    content.textContent = "";
    setNotice(users.length + (users.length === 1 ? " user" : " users"));
    if (users.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No users yet.";
      content.append(empty);
      return;
    }
    const rows = users.map((u) => [
      link("/users/" + encodeURIComponent(u.id), String(u.username)),
      u.display_name === null || u.display_name === undefined ? "—" : String(u.display_name),
      planCell(u),
      String(u.workspaces),
      when(u.created_at),
    ]);
    content.append(table(["Username", "Display name", "Plan", "Workspaces", "Created"], rows));
  }

  async function setPlan(id, plan) {
    setNotice(plan === "free" ? "Revoking the grant…" : "Granting " + plan + "…");
    const res = await fetch("/api/users/" + encodeURIComponent(id) + "/plan", {
      method: "PATCH",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ plan: plan }),
    });
    if (res.status === 401) {
      setNotice(EXPIRED);
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setNotice(
        body && typeof body.message === "string"
          ? body.message
          : "could not set the plan (" + res.status + ")"
      );
      return;
    }
    setNotice(
      plan === "free"
        ? "Grant revoked — the account is back to its Stripe plan."
        : "Granted " + plan + "."
    );
    await loadUser(id);
  }

  async function loadUser(id) {
    content.textContent = "Loading profile…";
    let data;
    try {
      data = await getJSON("/api/users/" + encodeURIComponent(id));
    } catch {
      content.textContent = "";
      return;
    }
    const user = data.user;
    const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
    content.textContent = "";

    const back = link("/users", "← All users");
    back.className = "back";
    content.append(back);

    const card = document.createElement("section");
    card.className = "card";
    const h1 = document.createElement("h1");
    h1.append(String(user.username), " ", badge(String(user.plan)));
    if (user.plan_override !== null && user.plan_override !== undefined) h1.append(" ", grantBadge());
    card.append(h1);
    const facts = document.createElement("dl");
    facts.className = "facts";
    facts.append(
      fact("Effective plan", String(user.plan)),
      fact("Stripe plan", String(user.stripe_plan)),
      fact(
        "Operator grant",
        user.plan_override === null || user.plan_override === undefined
          ? "none"
          : String(user.plan_override)
      ),
      fact("Display name", user.display_name === null || user.display_name === undefined ? "—" : String(user.display_name)),
      fact("User id", String(user.id)),
      fact("Created", when(user.created_at)),
      fact("Workspaces created", String(data.total_workspaces)),
      fact("Stripe customer", user.has_stripe_customer ? "yes" : "no"),
      fact("Period ends", user.period_end === null ? "—" : when(user.period_end)),
      fact("Grace until", user.grace_until === null ? "—" : when(user.grace_until))
    );
    card.append(facts);
    content.append(card);

    const planHeading = document.createElement("h2");
    planHeading.textContent = "Operator grant";
    content.append(planHeading);
    const planNote = document.createElement("p");
    planNote.className = "muted small";
    planNote.textContent =
      "Writes an operator grant (users.plan_override) and never touches Stripe's own plan column, so a billing sync can no longer wipe it. A real paid subscription retires the grant, because money outranks an operator. Choosing free revokes the grant and hands the account back to billing — it never cancels a subscription.";
    content.append(planNote);
    const planRow = document.createElement("div");
    planRow.className = "plan-row";
    const granted = user.plan_override !== null && user.plan_override !== undefined;
    const stripePlan = String(user.stripe_plan);
    for (const plan of PLAN_IDS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plan-btn";
      const current = plan === String(user.plan);
      // "free" is the REVOKE action, not a tier to grant: it clears the override
      // and the account falls back to whatever Stripe says. When the plan already
      // comes from a subscription there is nothing to revoke, so the button would
      // be a silent no-op — disable it and say where cancellations really happen.
      const revokeNoop = plan === "free" && !granted && stripePlan !== "free";
      if (plan === "free" && granted) {
        button.textContent = "free (revoke grant)";
        button.title = "Clears the operator grant; the account falls back to its Stripe plan";
      } else if (revokeNoop) {
        button.textContent = "free";
        button.title = "This plan comes from a Stripe subscription — cancel it in the billing portal";
        button.disabled = true;
      } else {
        button.textContent = current ? plan + " (current)" : plan;
        button.disabled = current;
      }
      button.addEventListener("click", () => {
        void setPlan(id, plan);
      });
      planRow.append(button);
    }
    content.append(planRow);

    const wsHeading = document.createElement("h2");
    wsHeading.textContent = "Workspaces created (" + workspaces.length + ")";
    content.append(wsHeading);
    if (workspaces.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "This user has not created a workspace.";
      content.append(empty);
      return;
    }
    content.append(
      table(
        ["Name", "Slug", "Kind", "Members", "Created"],
        workspaces.map((t) => [
          String(t.name),
          String(t.slug),
          String(t.kind),
          String(t.members),
          when(t.created_at),
        ])
      )
    );
  }

  const view = app.dataset.view;
  const userId = app.dataset.userId;
  if (view === "users") void loadUsers();
  else if (view === "user" && userId) void loadUser(userId);
  else setNotice("Unknown view.");
})();
`;
