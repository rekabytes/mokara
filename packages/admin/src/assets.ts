// The console's CSS and JS, held as strings and served from memory.
//
// Not files on disk on purpose: `serveStatic` resolves its root against the
// process cwd, which is packages/admin in dev (`pnpm --filter … dev`) and /app
// in the container — the same asset would need two different roots. In-memory
// serving is cwd-independent, needs no static middleware, and keeps the CSP
// fully closed (script-src/style-src 'self', no inline anything).

export const ADMIN_CSS = `
:root {
  color-scheme: light;
  --bg: #f5f7fb;
  --panel: #ffffff;
  --line: #dce2ec;
  --text: #17243b;
  --muted: #53627a;
  --accent: #2455df;
  --danger: #a33328;
  --raised: #eef3ff;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 0.9rem/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.sidebar { position: fixed; inset: 0 auto 0 0; width: 14.5rem; display: flex; flex-direction: column; padding: 1.6rem 1rem; background: #ffffff; border-right: 1px solid var(--line); overflow-y: auto; }
.brand { display: flex; align-items: center; gap: 0.75rem; margin: 0 0.5rem 2.5rem; color: var(--text); text-decoration: none; font-weight: 650; font-size: 1.05rem; letter-spacing: -0.03em; }
.brand-symbol { display: grid; place-items: center; width: 2.3rem; height: 2.3rem; border: 1px solid #c8d7ff; border-radius: 0.75rem; background: #eaf0ff; color: #2455df; }
.brand-caption { display: block; color: var(--muted); font-size: 0.7rem; font-weight: 400; letter-spacing: 0.02em; margin-top: 0.1rem; }
.nav-group { margin-bottom: 1.8rem; }
.nav-label, .operator-label { color: var(--muted); font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; }
.nav-label { margin: 0 0.75rem 0.65rem; }
.sidebar nav a { display: flex; gap: 0.7rem; align-items: center; padding: 0.65rem 0.75rem; margin: 0.2rem 0; border: 1px solid transparent; border-radius: 0.6rem; color: var(--muted); text-decoration: none; font-size: 0.82rem; }
.sidebar nav svg { flex: 0 0 1.1rem; width: 1.1rem; height: 1.1rem; }
.sidebar nav a:hover { color: var(--text); background: #f2f5fa; }
.sidebar nav a.nav-active { color: #1946c5; border-color: #cbd9ff; background: #edf2ff; }
.sidebar-footer { margin-top: auto; border-top: 1px solid var(--line); padding: 1.1rem 0.6rem 0; display: grid; gap: 0.8rem; }
.skip-link { position: fixed; top: -5rem; left: 1rem; z-index: 10; background: var(--accent); color: #ffffff; padding: 0.6rem 1rem; border-radius: 0.5rem; }
.skip-link:focus { top: 1rem; }
.page-header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.eyebrow { color: var(--muted); text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.12em; margin: 0 0 0.65rem; }
.page-header h1 { font-size: clamp(1.8rem, 3vw, 2.4rem); line-height: 1.15; letter-spacing: -0.05em; font-weight: 600; margin: 0 0 0.6rem; }
.page-description { color: var(--muted); font-size: 0.85rem; margin: 0; max-width: 40rem; }
.context-tag { flex-shrink: 0; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0.35rem 0.7rem; font-size: 0.7rem; }
.panel-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.2rem; align-items: start; }
.section-stack { display: grid; gap: 1.2rem; }
.panel { min-width: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 1rem; padding: 1.25rem; }
.panel-wide { grid-column: 1 / -1; }
.panel h2 { margin: 0 0 1rem; font-size: 0.95rem; font-weight: 550; letter-spacing: -0.01em; }
.panel > .small:first-of-type { margin-top: 0; }
.panel .card { background: transparent; border: 0; padding: 0; border-radius: 0; }
.panel-layout .table-wide table { min-width: 0; }
.panel-layout td { overflow-wrap: anywhere; }
.panel[aria-label="Service health"] td:first-child,
.panel[aria-label="Service health"] th:first-child { white-space: nowrap; overflow-wrap: normal; }
.usage-breakdown { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.2rem; margin-top: 1.2rem; }
.usage-breakdown .small, .usage-breakdown .data-note { grid-column: 1 / -1; margin: 0; }
.data-note { margin: 0.75rem 0; color: var(--muted); font-size: 0.75rem; }
.data-note summary { cursor: pointer; width: fit-content; }
.data-note[open] summary { color: var(--text); }
.data-note p { max-width: 65rem; margin-bottom: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
#app[data-view="billing"] .notice:empty { display: none; }
.billing-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; margin: 0 0 1.5rem; }
.billing-stats > div { min-width: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 0.8rem; padding: 1.1rem 1.2rem; }
.billing-stats dt { color: var(--muted); font-size: 0.8rem; }
.billing-stats dd { margin: 0.35rem 0 0; color: var(--text); font-size: clamp(1.1rem, 2.5vw, 1.8rem); font-weight: 600; letter-spacing: -0.04em; overflow-wrap: anywhere; }
.billing-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.billing-toolbar .filter-form { margin: 0; }
.billing-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; min-width: 0; }
.view-updated { color: var(--muted); font-size: 0.75rem; }
.billing-tools .data-note { margin: 0; }
.billing-tools .data-note[open] { flex-basis: 100%; }
.billing-tools .data-note[open] p { max-width: 32rem; }
.billing-table table { min-width: 38rem; }
.billing-table th:nth-child(1) { width: 25%; }
.billing-table th:nth-child(2) { width: 20%; }
.billing-table td { vertical-align: middle; padding-top: 1rem; padding-bottom: 1rem; }
.row-details { border: 0; background: transparent; color: var(--accent); padding: 0.2rem; font: inherit; font-size: 0.8rem; cursor: pointer; }
.row-details.has-issue::before { content: ""; display: inline-block; width: 0.4rem; height: 0.4rem; margin-right: 0.45rem; background: var(--danger); border-radius: 50%; }
.billing-detail-row { background: #f6f8fc; }
.billing-detail-row[hidden] { display: none; }
.billing-detail-row .billing-detail-facts { margin: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.billing-history { margin-top: 1.25rem; }
@media (max-width: 760px) { .billing-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; } .billing-stats > div { padding: 1rem; } .billing-detail-row .billing-detail-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
#content > .table-scroll { background: var(--panel); border-radius: 0.8rem; border: 1px solid var(--line); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 1100px) { .panel-layout { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) {
  .sidebar { position: static; width: auto; padding: 1rem; border-right: 0; border-bottom: 1px solid var(--line); }
  .brand { margin: 0 0 1.1rem; }
  .sidebar nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
  .nav-group { margin: 0; min-width: 0; }
  .nav-group:last-child { grid-column: 1 / -1; display: flex; align-items: center; gap: 0.5rem; }
  .nav-label { margin: 0 0.45rem 0.4rem; font-size: 0.6rem; }
  .sidebar nav a { padding: 0.4rem; font-size: 0.77rem; gap: 0.4rem; }
  .sidebar nav a span { overflow-wrap: anywhere; }
  .sidebar-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 0.6rem; padding: 0.7rem 0 0; }
  .page-header { margin-bottom: 1rem; }
  .context-tag { display: none; }
  .usage-breakdown { grid-template-columns: minmax(0, 1fr); }
  .panel-layout .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem 1rem; }
  .panel { padding: 1rem; border-radius: 0.8rem; }
}
.table-scroll { max-width: 100%; overflow-x: auto; }
.table-wide table { min-width: 34rem; }
.table-scroll:not(.table-wide) th:first-child,
.table-scroll:not(.table-wide) td:first-child { white-space: normal; overflow-wrap: anywhere; }
.card h2 { margin-top: 0; }
.refresh-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
.pager { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-top: 0.75rem; }
.pager a { color: var(--accent); }
.filter-form { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: end; margin: 1rem 0; }
.filter-form label { display: flex; flex-direction: column; gap: 0.3rem; min-width: 0; font-size: 0.8rem; }
.filter-form input, .filter-form select { max-width: 100%; padding: 0.45rem; background: var(--panel); border: 1px solid var(--line); border-radius: 0.5rem; color: var(--text); font: inherit; }
.filter-form a { color: var(--accent); }

.sidebar form { margin: 0; }

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

main#app { margin-left: 14.5rem; padding: 2.5rem clamp(1.25rem, 3vw, 3rem); min-width: 0; }
@media (max-width: 760px) { main#app { margin: 0; padding: 1.4rem 1rem; } }

.notice { min-height: 1.4rem; margin: 0 0 1rem; color: var(--muted); font-size: 0.75rem; }

.muted { color: var(--muted); }
.small { font-size: 0.78rem; }
.error { color: var(--danger); margin: 0 0 0.75rem; }

table { width: 100%; border-collapse: collapse; background: transparent; }

th, td { padding: 0.75rem 0.7rem; text-align: left; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: #f3f6fb; }
tbody tr:hover { background: #f8faff; }

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
.badge-pro { color: #2455df; border-color: #cbd9ff; background: #edf2ff; }
.badge-ultra { color: #6b3d9b; border-color: #ddd0f0; background: #f5effc; }

.badge-grant { color: #805413; border-color: #ead4a7; background: #fff8e9; }
.badge-warning { color: var(--danger); border-color: #efccc7; background: #fff1ee; }
.badge-healthy { color: #176444; border-color: #bce1ce; background: #edf9f2; }

.plan-cell { display: inline-flex; align-items: center; gap: 0.35rem; }

.card { background: var(--panel); border: 1px solid var(--line); border-radius: 1rem; padding: 1.25rem; margin-bottom: 1.2rem; }

.card h1 { margin: 0 0 0.2rem; font-size: 1.25rem; }

.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.5rem 1.25rem; margin: 0.75rem 0 0; padding: 0; }

.facts div { min-width: 0; padding: 0.6rem 0; }
.panel-layout .facts dd { font-size: 1.55rem; font-weight: 550; letter-spacing: -0.04em; }
.panel-layout .facts { margin: 0; gap: 0.75rem 1.5rem; }
@media (min-width: 761px) { .panel-layout .facts { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.facts dt { color: var(--muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em; }
.facts dd { margin: 0.1rem 0 0; }

h2 { font-size: 0.95rem; margin: 1.4rem 0 0.6rem; overflow-wrap: anywhere; }
.facts dd, .card h1 { overflow-wrap: anywhere; }

.plan-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }

.plan-btn {
  padding: 0.4rem 0.9rem;
  background: var(--raised);
  color: var(--text);
  border: 1px solid #cbd9ef;
  border-radius: 0.6rem;
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
}

.plan-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

.plan-btn:disabled { opacity: 0.45; cursor: default; }

.back { display: inline-block; margin-bottom: 0.9rem; color: var(--muted); text-decoration: none; font-size: 0.84rem; }
.back:hover { color: var(--text); }

.login-body { display: grid; place-items: center; min-height: 100dvh; padding: 1.25rem; }

.login-card { width: min(25rem, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 1.2rem; padding: 2rem; }
.login-card h1 { letter-spacing: -0.03em; }
@media (prefers-reduced-motion: no-preference) { a, button { transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease; } }

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
  color: #ffffff;
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
    const wrapper = document.createElement("div");
    wrapper.className = headers.length > 2 ? "table-scroll table-wide" : "table-scroll";
    if (headers.length > 2) {
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", headers.join(" / "));
    }
    wrapper.append(el);
    return wrapper;
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

  function dataNote(text, label = "About this data") {
    const details = document.createElement("details");
    details.className = "data-note";
    const summary = document.createElement("summary"); summary.textContent = label;
    details.append(summary, paragraph(text));
    return details;
  }

  function paragraph(text) {
    const p = document.createElement("p");
    p.className = "muted small";
    p.textContent = text;
    return p;
  }

  function groupSections() {
    const layout = document.createElement("div");
    layout.className = app.dataset.view === "overview" ? "panel-layout" : "section-stack";
    let panel;
    for (const node of Array.from(content.children)) {
      if (node.tagName && node.tagName.toLowerCase() === "h2") {
        panel = document.createElement("section");
        panel.className = "panel";
        panel.setAttribute("aria-label", node.textContent);
        if (app.dataset.view === "overview" && node.textContent === "Usage") panel.className += " panel-wide";
        panel.append(node); layout.append(panel);
      } else if (panel) panel.append(node);
    }
    if (layout.children.length) content.append(layout);
    if (app.dataset.view === "overview") for (const section of Array.from(layout.children)) {
      const children = Array.from(section.children);
      if (children[0]?.textContent !== "Usage") continue;
      const breakdown = document.createElement("div"); breakdown.className = "usage-breakdown";
      for (const node of children) if (node.className?.includes("table-scroll")) breakdown.append(node);
      for (const node of children) if (node.tagName?.toLowerCase() === "p" || node.className === "data-note") breakdown.append(node);
      section.append(breakdown);
    }
  }

  function heading(text) {
    const h = document.createElement("h2");
    h.textContent = text;
    content.append(h);
  }

  function count(value) { return value === null || value === undefined ? "Unavailable" : String(value); }
  function serviceStatus(value) {
    const span = document.createElement("span");
    span.className = "badge" + (value === "healthy" ? " badge-healthy" : value === "unavailable" ? " badge-warning" : "");
    span.textContent = value.replaceAll("_", " ");
    return span;
  }
  function attentionCount(value) {
    const span = document.createElement("span");
    span.className = value === null || value > 0 ? "badge badge-warning" : "badge";
    span.textContent = count(value);
    return span;
  }
  function timestamp(value) { return value ? when(value) : "None recorded"; }
  function bytes(value) {
    if (!Number.isFinite(value)) return "Unavailable";
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KiB";
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MiB";
    return (value / (1024 * 1024 * 1024)).toFixed(1) + " GiB";
  }

  function refreshButton(reload) {
    const row = document.createElement("div");
    row.className = "refresh-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plan-btn";
    button.textContent = "Refresh";
    button.title = "Refresh read-only snapshot";
    button.addEventListener("click", () => { void reload(); });
    row.append(button);
    content.append(row);
  }

  async function loadOverview() {
    content.textContent = "Checking service health…";
    let data;
    try { data = await getJSON("/api/overview"); }
    catch { content.textContent = "Monitoring unavailable. No current snapshot."; return; }
    content.textContent = "";
    setNotice("Checked " + when(data.checked_at) + " · Backend package " + data.version + " · " + data.deploy_mode + " · uptime " + data.uptime_seconds + "s");
    refreshButton(loadOverview);
    heading("Service health");
    const health = data.health;
    content.append(table(["Service", "Status", "What was checked"], [
      ["Database", serviceStatus(health.database.status), health.database.latency_ms === null ? "Probe failed or timed out" : "SELECT 1 · " + health.database.latency_ms + "ms"],
      ["Redis", serviceStatus(health.redis.status), health.redis.latency_ms === null ? "Probe failed or timed out" : "PING · " + health.redis.latency_ms + "ms"],
      ["Storage", serviceStatus(health.storage.status), "Config only"],
      ["Billing", health.billing.configured ? "Configured" : "Not configured", "Config only"],
      ["GitHub", health.github.configured ? health.github.webhook_configured ? "App and webhook configured" : "Webhook not configured" : "Not configured", "Config only"],
    ]));
    heading("Needs attention");
    const attentionLabels = { api_errors: "API errors · 60 min", billing_webhooks: "Billing webhook failures · 60 min", github_retries: "GitHub retries", github_stale: "GitHub pending > 5 min", github_failed_links: "Failed GitHub links", github_paused: "Paused GitHub links", github_verification: "GitHub reauthorization", billing_grace: "Grace flags (incl. expired)" };
    content.append(dataNote("Categories can overlap. Zero counts are shown; unavailable counts need investigation."));
    content.append(table(["Category", "Count"], data.attention.map(row => [row.href ? link(row.href, String(attentionLabels[row.key] || row.label)) : String(attentionLabels[row.key] || row.label), attentionCount(row.count)])));
    const snapshot = data.snapshot;
    heading("Usage");
    if (snapshot) {
      const usage = snapshot.usage;
      const card = document.createElement("section");
      card.className = "card";
      const facts = document.createElement("dl");
      facts.className = "facts";
      facts.append(fact("Users", count(usage.users)), fact("Signups · 7 days", count(usage.signups_7d)), fact("Workspaces", count(usage.workspaces)), fact("Tasks", count(usage.tasks)), fact("Files", count(usage.attachments)), fact("Stored attachment + logo bytes", bytes(usage.storage_bytes)), fact("Operator grants", count(usage.operator_grants)));
      card.append(facts);
      content.append(card);
      content.append(table(["Effective plan", "Users"], usage.plans.map(row => [String(row.plan), count(row.count)])));
      content.append(dataNote("Effective plans include operator grants; these are not subscription or revenue counts."));
      content.append(table(["Task status", "Tasks"], usage.task_statuses.map(row => [String(row.status), count(row.count)])));
      heading("GitHub processing");
      const github = snapshot.github;
      content.append(table(["Metric", "Value"], [
        ["Connected accounts", count(github.connections)], ["Active personal repository associations", count(github.active_repository_associations)],
        ["Queued jobs", count(github.queued)], ["Oldest pending job", timestamp(github.oldest_pending_at)], ["Last successful linked-issue sync", timestamp(github.last_synced_at)],
      ]));
    } else content.append(paragraph("Usage unavailable — unknown, not zero."));
    heading("API & billing · 60 min");
    const metrics = data.metrics;
    if (metrics) {
      content.append(dataNote("Last 60 minute buckets; monitoring begins after deployment. Admin traffic and health probes are excluded. No request bodies, URLs or user identities are stored."));
      content.append(table(["Metric", "Count"], [["API requests", count(metrics.requests)], ["API server errors", count(metrics.server_errors)], ["Billing webhook accepted", count(metrics.billing_received)], ["Billing webhook failures", count(metrics.billing_failed)]]));
      content.append(table(["API error code", "Count"], metrics.errors.map(row => [String(row.code), count(row.count)])));
      if (!metrics.errors.length) content.append(paragraph("No API errors recorded in this window."));
    } else content.append(paragraph("Operational counters unavailable — no zero-error claim can be made."));
    groupSections();
  }

  function filters(fields, path, target = content) {
    const params = new URL(window.location.href).searchParams;
    const form = document.createElement("form");
    form.className = "filter-form";
    form.method = "get";
    form.action = path;
    form.setAttribute("role", "search");
    for (const field of fields) {
      const label = document.createElement("label");
      if (field.compact) { const text = document.createElement("span"); text.className = "sr-only"; text.textContent = field.label; label.append(text); }
      else label.append(field.label);
      const input = document.createElement(field.options ? "select" : "input");
      input.name = field.name;
      if (field.compact) input.setAttribute("aria-label", field.label);
      if (field.options) for (const value of field.options) {
        const option = document.createElement("option"); option.value = value; option.textContent = value || "All"; option.selected = value === (params.get(field.name) || ""); input.append(option);
      } else { input.type = field.type || "text"; input.maxLength = 100; input.value = params.get(field.name) || ""; if (field.placeholder) input.placeholder = field.placeholder; }
      label.append(input); form.append(label);
    }
    const submit = document.createElement("button"); submit.type = "submit"; submit.className = "plan-btn"; submit.textContent = "Filter";
    form.append(submit, link(path, "Clear filters")); target.append(form);
  }

  function quota(used, limit, storage) {
    return (storage ? bytes(used) : count(used)) + " / " + (limit === null ? "Unlimited" : storage ? bytes(limit) : count(limit)) + (limit !== null && used > limit ? " · OVER LIMIT" : "");
  }

  function pagination(data, path, pageKey = "page", target = content) {
    const row = document.createElement("nav");
    row.className = "pager";
    row.setAttribute("aria-label", "Pagination");
    const params = new URL(window.location.href).searchParams;
    const destination = page => { const query = new URLSearchParams(params); query.set(pageKey, String(page)); return path + "?" + query; };
    if (data.page > 1) row.append(link(destination(data.page - 1), "Previous"));
    row.append(paragraph(data.total === 0 ? "0 records" : "Page " + data.page + " · " + data.total + " records"));
    if (data.page * data.page_size < data.total) row.append(link(destination(data.page + 1), "Next"));
    target.append(row);
  }

  async function loadAttention() {
    content.textContent = "Loading queued problems…";
    const page = new URL(window.location.href).searchParams.get("page") || "1";
    let data;
    try { data = await getJSON("/api/attention?page=" + encodeURIComponent(page)); }
    catch { content.textContent = "Queue details unavailable."; return; }
    content.textContent = "";
    setNotice(data.total + (data.total === 1 ? " job" : " jobs") + " · oldest first");
    refreshButton(loadAttention);
    heading("GitHub queue");
    content.append(dataNote("Jobs awaiting retry or pending over five minutes, oldest first. Delivery IDs correlate with GitHub deliveries and backend logs. No payloads or task content are shown. Account and billing flags are in Overview.", "Queue details"));
    content.append(table(["Job / delivery", "Type", "Attempts", "Created", "Retry at", "Lease ends", "Error"], data.jobs.map(job => [String(job.id) + (job.delivery_id ? " / " + job.delivery_id : ""), String(job.kind), count(job.attempts), when(job.created_at), when(job.retry_at), timestamp(job.locked_until), job.error_code === null ? "Pending" : String(job.error_code)])));
    if (!data.jobs.length) content.append(paragraph(data.total ? "No jobs on this page. Use Previous to return." : "No jobs need attention."));
    pagination(data, "/attention");
    groupSections();
  }

  async function loadAudit() {
    content.textContent = "Loading audit trail…";
    let data;
    try { data = await getJSON("/api/audit?" + new URL(window.location.href).searchParams); }
    catch { content.textContent = "Audit records unavailable."; return; }
    content.textContent = "";
    setNotice(data.total + " changes");
    refreshButton(loadAudit);
    filters([{ name: "actor", label: "Operator" }, { name: "user", label: "User name or ID" }, { name: "action", label: "Action", options: ["", "plan_override_changed"] }, { name: "from", label: "From (UTC)", type: "date" }, { name: "to", label: "Through (UTC)", type: "date" }], "/audit");
    heading("Change history");
    content.append(dataNote("Only changes made after this feature was deployed are recorded. The console uses one operator account; this identifies that account, not individual people sharing it. Revoking a grant never cancels a Stripe subscription."));
    content.append(table(["When", "Operator", "Action", "User", "Previous grant", "New grant"], data.events.map(event => [when(event.created_at), String(event.actor), String(event.action), event.target_user_id ? link("/users/" + encodeURIComponent(event.target_user_id), String(event.target_username)) : String(event.target_username) + " (deleted)", event.from_plan === null ? "None" : String(event.from_plan), event.to_plan === null ? "None" : String(event.to_plan)])));
    if (!data.events.length) content.append(paragraph(data.total ? "No events on this page. Use Previous to return." : "No operator plan changes recorded yet."));
    pagination(data, "/audit");
    groupSections();
  }

  async function loadWorkspaces() {
    content.textContent = "Loading workspace support…";
    let data;
    try { data = await getJSON("/api/workspaces?" + new URL(window.location.href).searchParams); }
    catch { content.textContent = "Workspace support unavailable."; return; }
    content.textContent = "";
    setNotice("Updated " + when(data.checked_at));
    refreshButton(loadWorkspaces);
    filters([{ name: "q", label: "Workspace, slug or owner" }], "/workspaces");
    heading("Workspace directory");
    content.append(dataNote("Limits follow the owner's effective plan and deployment mode. Task counts have no plan quota. Storage includes attachments and logos, not orphaned bucket objects."));
    content.append(table(["Workspace", "Owner", "Plan", "Members / limit", "Tasks", "Files", "Storage / limit"], data.workspaces.map(workspace => [link("/workspaces/" + workspace.id, workspace.name + " (" + workspace.kind + ")"), link("/users/" + workspace.owner.id, workspace.owner.username), String(workspace.plan), quota(workspace.members, workspace.limits.members, false), count(workspace.tasks), count(workspace.files), quota(workspace.storage_bytes, workspace.limits.storage_bytes, true)])));
    if (!data.workspaces.length) content.append(paragraph("No workspaces match this page/filter."));
    pagination(data, "/workspaces");
    groupSections();
  }

  async function loadWorkspace(id) {
    content.textContent = "Loading workspace support…";
    let data;
    try { data = await getJSON("/api/workspaces/" + encodeURIComponent(id)); }
    catch { content.textContent = "Workspace details unavailable."; return; }
    content.textContent = "";
    setNotice("Updated " + when(data.checked_at));
    content.append(link("/workspaces", "← All workspaces"));
    refreshButton(() => loadWorkspace(id));
    const workspace = data.workspace;
    heading(workspace.name);
    const card = document.createElement("section"); card.className = "card";
    const facts = document.createElement("dl"); facts.className = "facts";
    facts.append(fact("Slug / kind", workspace.slug + " / " + workspace.kind), fact("Owner", workspace.owner.username), fact("Effective / Stripe plan", workspace.plan + " / " + workspace.stripe_plan), fact("Operator grant", workspace.plan_override || "None"), fact("Members / limit", quota(workspace.members.length, workspace.limits.members, false)), fact("Owner team slots", quota(workspace.owner_team_count, workspace.limits.teams, false)), fact("Storage / limit", quota(workspace.storage_bytes, workspace.limits.storage_bytes, true)), fact("Maximum file size", workspace.limits.max_file_bytes === null ? "Unlimited" : bytes(workspace.limits.max_file_bytes)), fact("Tasks (uncapped)", count(workspace.tasks)), fact("Files", count(workspace.files)), fact("Owner GitHub connection", workspace.github.owner_connection ? workspace.github.owner_connection.status : "Not connected"), fact("Owner GitHub verified", workspace.github.owner_connection ? when(workspace.github.owner_connection.verified_at) : "Unknown"));
    card.append(facts); content.append(card);
    heading("Members");
    content.append(table(["User", "Role", "Joined"], workspace.members.map(member => [link("/users/" + member.id, member.username), String(member.role), when(member.joined_at)])));
    heading("Task totals — no private task content");
    content.append(table(["Status", "Count"], workspace.task_statuses.map(row => [row.status, count(row.count)])));
    heading("Workspace GitHub links");
    content.append(dataNote("Owner connection is personal; workspace issue links can be published by other members. No credentials or repository names are shown."));
    content.append(table(["Publication", "Sync", "Count"], workspace.github.issue_links.map(row => [row.publication_status, row.sync_status, count(row.count)])));
    if (!workspace.github.issue_links.length) content.append(paragraph("No GitHub issue links recorded."));
    groupSections();
  }

  function billingAccountsTable(users) {
    const wrapper = document.createElement("div"); wrapper.className = "table-scroll billing-table";
    wrapper.tabIndex = 0; wrapper.setAttribute("role", "region"); wrapper.setAttribute("aria-label", "Billing accounts");
    const el = document.createElement("table");
    const thead = document.createElement("thead"); const head = document.createElement("tr");
    for (const name of ["Account", "Plan", "Subscription", "Last verified", "Details"]) {
      const th = document.createElement("th"); th.scope = "col"; th.textContent = name; head.append(th);
    }
    thead.append(head); const body = document.createElement("tbody");
    for (const user of users) {
      const row = document.createElement("tr");
      const plan = document.createElement("span"); plan.className = "plan-cell"; plan.append(badge(user.effective_plan)); if (user.operator_grant) plan.append(grantBadge());
      const status = document.createElement("span");
      status.className = "badge" + (user.subscription_status === "active" ? " badge-healthy" : ["past_due", "unpaid"].includes(user.subscription_status) ? " badge-warning" : "");
      status.textContent = user.subscription_status === "unknown" ? user.has_customer ? "Not verified" : "Not connected" : user.subscription_status === "none" ? "No subscription" : user.subscription_status.replaceAll("_", " ");
      const detailRow = document.createElement("tr"); detailRow.className = "billing-detail-row"; detailRow.id = "billing-detail-" + user.id; detailRow.hidden = true;
      const cell = document.createElement("td"); cell.colSpan = 5;
      const facts = document.createElement("dl"); facts.className = "facts billing-detail-facts";
      const date = value => value ? when(value) : "—";
      facts.append(fact("Stripe plan", user.stripe_plan), fact("Operator grant", user.operator_grant || "—"), fact("Stripe customer", user.has_customer ? "Connected" : "Not connected"), fact("Cancellation", user.cancel_at ? date(user.cancel_at) : user.cancel_at_period_end === null ? "Not verified" : user.cancel_at_period_end ? "At period end" : "Not scheduled"), fact("Period ends", date(user.period_end)), fact("Grace ends", date(user.grace_until)), fact("Last invoice event", user.last_invoice_event ? user.last_invoice_event.replaceAll("_", " ") : "Not observed"), fact("Invoice event time", date(user.invoice_observed_at)), fact("Last sync attempt", date(user.attempted_at)), fact("Sync error", user.error_code || "—"));
      cell.append(facts); detailRow.append(cell);
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "row-details"; toggle.textContent = "Details";
      toggle.setAttribute("aria-label", "Details for " + user.username); toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", detailRow.id);
      if (user.error_code) { toggle.className += " has-issue"; toggle.title = "Sync issue — " + user.error_code; }
      toggle.addEventListener("click", () => { detailRow.hidden = !detailRow.hidden; toggle.setAttribute("aria-expanded", String(!detailRow.hidden)); toggle.textContent = detailRow.hidden ? "Details" : "Close"; });
      for (const value of [link("/users/" + user.id, user.username), plan, status, user.verified_at ? when(user.verified_at) : "Not verified", toggle]) {
        const td = document.createElement("td"); if (typeof value === "string") td.textContent = value; else td.append(value); row.append(td);
      }
      body.append(row, detailRow);
    }
    el.append(thead, body); wrapper.append(el); return wrapper;
  }

  async function loadBilling() {
    content.textContent = "Loading billing…";
    const params = new URL(window.location.href).searchParams;
    const query = new URLSearchParams();
    for (const key of ["page", "q", "status"]) if (params.get(key)) query.set(key, params.get(key));
    const historyQuery = new URLSearchParams(); historyQuery.set("page", params.get("history_page") || "1"); if (params.get("q")) historyQuery.set("q", params.get("q"));
    let data;
    try { data = await getJSON("/api/billing?" + query); }
    catch { content.textContent = "Billing unavailable."; return; }
    content.textContent = ""; setNotice("");
    const summary = data.summary || { accounts: data.total, active_subscriptions: null, grants: null, sync_issues: null };
    const stats = document.createElement("dl"); stats.className = "billing-stats"; stats.setAttribute("aria-label", "Matching account totals");
    for (const [label, value] of [["Accounts", summary.accounts], ["Active subscriptions", summary.active_subscriptions], ["Grants", summary.grants], ["Sync issues", summary.sync_issues]]) stats.append(fact(label, count(value)));
    content.append(stats);
    const panel = document.createElement("section"); panel.className = "panel billing-panel"; panel.setAttribute("aria-label", "Subscriptions");
    const toolbar = document.createElement("div"); toolbar.className = "billing-toolbar";
    filters([{ name: "q", label: "User", placeholder: "Search accounts", compact: true }, { name: "status", label: "Status", compact: true, options: ["", "unknown", "none", "active", "trialing", "past_due", "unpaid", "canceled", "paused", "incomplete", "incomplete_expired", "error", "canceling", "payment_failed", "grant"] }], "/billing", toolbar);
    const tools = document.createElement("div"); tools.className = "billing-tools";
    const updated = document.createElement("time"); updated.className = "view-updated"; updated.dateTime = data.checked_at;
    updated.textContent = "View updated " + new Date(data.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); updated.title = when(data.checked_at) + " — page snapshot, not Stripe verification";
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "plan-btn"; refresh.textContent = "Refresh"; refresh.addEventListener("click", () => { void loadBilling(); });
    const info = dataNote("Billing " + (data.configured ? "enabled" : "disabled") + ". Counts cover all matching accounts, not just this page. Active subscriptions are last observed active statuses, not proof of payment. Sync issues count accounts with a last reconciliation error; unassigned failures remain in history. Unknown means not verified since monitoring began. Grants are not subscriptions. Stripe updates only through existing webhooks/user sync; view updated is the page snapshot time. Last invoice event is a notification, not complete payment history.", "Info");
    tools.append(updated, refresh, info); toolbar.append(tools); panel.append(toolbar, billingAccountsTable(data.users));
    if (!data.users.length) panel.append(paragraph(data.total ? "No accounts on this page." : "No matching accounts."));
    pagination(data, "/billing", "page", panel); content.append(panel);
    const historyPanel = document.createElement("section"); historyPanel.className = "panel billing-history";
    const historyTitle = document.createElement("h2"); historyTitle.textContent = "Sync history"; historyPanel.append(historyTitle);
    historyPanel.append(dataNote("Post-deployment attempts only. History follows the user search, not the subscription-status filter; unassigned/deleted users appear when search is empty.")); content.append(historyPanel);
    let history;
    try { history = await getJSON("/api/billing/history?" + historyQuery); }
    catch { historyPanel.append(paragraph("Sync history unavailable.")); return; }
    historyPanel.append(table(["When", "Account", "Source", "Outcome", "Error"], history.events.map(event => [when(event.created_at), event.user ? link("/users/" + event.user.id, event.user.username) : "Unassigned / deleted", event.source, event.outcome, event.error_code || "—"])));
    if (!history.events.length) historyPanel.append(paragraph(history.total ? "No attempts on this page." : "No sync attempts."));
    pagination(history, "/billing", "history_page", historyPanel);
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
    heading("Account directory");
    if (users.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No users yet.";
      content.append(empty);
      groupSections();
      return;
    }
    const rows = users.map((u) => [
      link("/users/" + encodeURIComponent(u.id), String(u.username)),
      u.display_name === null || u.display_name === undefined ? "—" : String(u.display_name),
      planCell(u),
      String(u.workspaces),
      when(u.created_at),
      Array.isArray(u.attention_flags) && u.attention_flags.length ? u.attention_flags.join(", ") : "None",
    ]);
    content.append(table(["Username", "Display name", "Plan", "Workspaces", "Created", "Attention flags"], rows));
    groupSections();
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
      fact("Grace until", user.grace_until === null ? "—" : when(user.grace_until)),
      fact("GitHub connection", user.github ? String(user.github.status) : "Not connected"),
      fact("GitHub access verified", user.github ? when(user.github.verified_at) : "—"),
      fact("Active repositories", user.github ? count(user.github.active_repositories) : "0"),
      fact("GitHub reauthorization", user.github ? user.github.reauthorization_required ? "Required" : "Current" : "—"),
      fact("GitHub links needing attention", count(user.github_issue_links_needing_attention))
    );
    card.append(facts);
    content.append(card);

    const planHeading = document.createElement("h2");
    planHeading.textContent = "Operator grant";
    content.append(planHeading);
    content.append(paragraph("Revoking a grant does not cancel a subscription."));
    content.append(dataNote("Grants override the effective plan without changing Stripe's plan. A mapped paid subscription retires the grant. Choosing free revokes the grant and restores the billing plan.", "How grants work"));
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
      groupSections();
      return;
    }
    content.append(
      table(
        ["Name", "Slug", "Kind", "Members", "Created"],
        workspaces.map((t) => [
          link("/workspaces/" + encodeURIComponent(t.id), String(t.name)),
          String(t.slug),
          String(t.kind),
          String(t.members),
          when(t.created_at),
        ])
      )
    );
    groupSections();
  }

  const view = app.dataset.view;
  const userId = app.dataset.userId;
  if (view === "overview") void loadOverview();
  else if (view === "attention") void loadAttention();
  else if (view === "audit") void loadAudit();
  else if (view === "workspaces") void loadWorkspaces();
  else if (view === "workspace" && app.dataset.workspaceId) void loadWorkspace(app.dataset.workspaceId);
  else if (view === "billing") void loadBilling();
  else if (view === "users") void loadUsers();
  else if (view === "user" && userId) void loadUser(userId);
  else setNotice("Unknown view.");
})();
`;
