// The console's CSS and JS, held as strings and served from memory.
//
// Not files on disk on purpose: `serveStatic` resolves its root against the
// process cwd, which is packages/admin in dev (`pnpm --filter … dev`) and /app
// in the container — the same asset would need two different roots. In-memory
// serving is cwd-independent, needs no static middleware, and keeps the CSP
// fully closed (script-src/style-src 'self', no inline anything).

export const ADMIN_CSS = `
@font-face { font-family: "Instrument Sans"; font-style: normal; font-weight: 400 700; font-display: swap; src: url("/assets/fonts/instrument-sans-latin.woff2") format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-style: normal; font-weight: 400; font-display: swap; src: url("/assets/fonts/ibm-plex-mono-latin-400.woff2") format("woff2"); }
:root {
  color-scheme: light;
  --font-body: "Instrument Sans", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
  --bg: #f4f5f5;
  --panel: #ffffff;
  --text: #232626;
  --muted: #636b6b;
  --line: #dfe3e2;
  --control-line: #85918e;
  --accent: #a63e24;
  --accent-hover: #803019;
  --raised: #faeee9;
  --danger: #a92d35;
  --danger-bg: #fff1f2;
  --success: #146c52;
  --success-bg: #edf6f1;
  --radius: 2px;
  --control-radius: 4px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 400 14px/1.55 var(--font-body); -webkit-font-smoothing: antialiased; font-synthesis: none; }
a { color: var(--accent); text-underline-offset: 3px; }
button, input, select { font: inherit; }
button, a, summary { -webkit-tap-highlight-color: transparent; }
button { cursor: pointer; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
[hidden] { display: none !important; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.skip-link { position: fixed; top: -80px; left: 16px; z-index: 50; padding: 10px 16px; border-radius: var(--control-radius); color: white; background: var(--accent); }
.skip-link:focus { top: 16px; }
.console-header { background: var(--panel); border-bottom: 1px solid var(--line); }
.console-header-inner { display: flex; align-items: center; gap: 26px; max-width: 1760px; min-height: 86px; padding: 0 48px; margin: auto; }
.brand { display: inline-flex; align-items: center; gap: 12px; flex-shrink: 0; color: var(--text); text-decoration: none; font-size: 27px; font-weight: 500; letter-spacing: -0.05em; }
.brand-symbol { display: grid; place-items: center; width: 32px; height: 32px; color: var(--accent); background: transparent; }
.brand-symbol svg { width: 29px; height: 29px; }
.brand-caption { display: block; margin-top: 2px; color: var(--muted); font: 400 11px/1.4 var(--font-mono); letter-spacing: 0; }
.console-nav { display: grid; gap: 28px; }
.nav-group { display: grid; gap: 3px; }
.console-nav a { display: grid; grid-template-columns: 22px minmax(0, 1fr) 12px; align-items: center; gap: 10px; min-height: 40px; padding: 8px 10px; margin-left: -10px; border-left: 2px solid transparent; color: var(--muted); font-size: 13px; font-weight: 400; text-decoration: none; }
.console-nav a:hover { color: var(--text); background: #e9edeb; }
.console-nav a.nav-active { color: var(--text); background: white; border-left-color: var(--accent); }
.console-account { display: flex; align-items: center; gap: 24px; margin-left: auto; flex-shrink: 0; }
.console-account form { margin: 0; }
.btn, .plan-btn, .row-details, .signout, .back { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 7px 13px; border: 1px solid var(--control-line); border-radius: var(--control-radius); background: var(--panel); color: var(--text); font: inherit; font-size: 12px; font-weight: 400; line-height: 1.5; text-decoration: none; white-space: nowrap; cursor: pointer; }
.btn:hover, .plan-btn:hover:not(:disabled), .row-details:hover, .signout:hover, .back:hover { background: var(--bg); border-color: var(--muted); text-decoration: none; }
.btn-primary { color: white; background: var(--text); border-color: var(--text); }
.btn-primary:hover { color: white; background: #394347; border-color: #394347; }
.btn-sm, .row-details { min-height: 32px; padding: 5px 11px; }
.btn:disabled, .plan-btn:disabled { color: var(--muted); background: var(--bg); border-color: var(--line); cursor: not-allowed; }
.signout { min-height: 32px; padding: 5px 10px; font-size: 11px; }
main#app { min-width: 0; padding: 40px 0 64px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 38px; }
.page-eyebrow { margin: 0 0 14px; color: var(--muted); font: 400 11px/1.5 var(--font-mono); letter-spacing: 0.045em; text-transform: uppercase; }
.page-header h1 { margin: 0; font-size: clamp(36px, 3.4vw, 48px); font-weight: 400; line-height: 1.08; letter-spacing: -0.045em; }
.notice { margin: 0 0 24px; padding: 13px 16px; border: 1px solid #dac0b6; border-radius: var(--control-radius); color: #803019; background: var(--raised); font-size: 13px; overflow-wrap: anywhere; }
.notice[data-tone="error"], .error { color: var(--danger); background: var(--danger-bg); border-color: #e9bbc0; }
.notice:empty { display: none; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.error { padding: 12px 14px; border: 1px solid #e9bbc0; border-radius: var(--control-radius); }
.admin-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 28px; padding: 24px 0; border-top: 1px solid #aeb6b2; border-bottom: 1px solid var(--line); }
.admin-stats > div { min-width: 0; padding: 0 24px; border-right: 1px solid var(--line); }
.admin-stats > div:first-child { padding-left: 0; }
.admin-stats > div:last-child { border: 0; }
.admin-stats dt { color: var(--muted); font: 400 11px/1.6 var(--font-mono); letter-spacing: 0.02em; }
.admin-stats dd { margin: 10px 0 0; font-size: clamp(29px, 3vw, 42px); font-weight: 400; line-height: 1.1; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.admin-stats .stat-long dd { font-size: clamp(21px, 2.1vw, 29px); line-height: 1.3; }
.panel-layout { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); align-items: start; gap: 24px; }
.section-stack { display: grid; gap: 24px; }
.panel, .card { min-width: 0; padding: 26px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
.card { margin-bottom: 24px; }
.panel-layout > .panel { grid-column: span 6; }
.panel-layout > .service-panel { grid-column: 1 / -1; }
.panel-layout > .attention-panel, .panel-layout > .github-panel { grid-column: span 5; }
.panel-layout > .usage-panel, .panel-layout > .metrics-panel { grid-column: span 7; }
h2, h3 { overflow-wrap: anywhere; }
h2, .panel h2, .card h2 { margin: 0 0 22px; font-size: 19px; font-weight: 400; letter-spacing: -0.025em; }
.panel h2:not(:first-child) { margin-top: 24px; }
.panel .card { margin: 0; padding: 0; border: 0; border-radius: 0; }
.directory-panel, .billing-panel { padding: 0; overflow: hidden; }
.directory-panel > h2, .billing-panel > h2 { display: flex; align-items: center; gap: 12px; margin: 0; padding: 22px 26px; border-bottom: 1px solid var(--line); }
.admin-toolbar, .billing-toolbar { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
.directory-panel > .admin-toolbar, .billing-toolbar { margin: 0; padding: 20px 26px; background: #fcfdfc; }
.admin-tools, .billing-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; margin-left: auto; }
.view-updated { color: var(--muted); font: 400 11px/1.6 var(--font-mono); }
.filter-form { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin: 0; min-width: 0; }
.filter-form label { display: grid; gap: 8px; min-width: 0; max-width: 100%; color: var(--muted); font: 400 11px/1.5 var(--font-mono); }
.filter-form input, .filter-form select, .login-card input { width: 100%; min-width: 0; min-height: 36px; padding: 7px 11px; border: 1px solid var(--control-line); border-radius: var(--control-radius); color: var(--text); background: var(--panel); font: 400 13px/1.5 var(--font-body); }
.filter-form input[type="text"] { width: 210px; max-width: 100%; }
.filter-form select { max-width: 220px; cursor: pointer; }
.filter-form input::placeholder { color: var(--muted); opacity: 1; }
.filter-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.data-note { margin: 12px 0; color: var(--muted); font-size: 12px; }
.data-note summary { display: inline-flex; align-items: center; gap: 7px; min-height: 32px; padding: 5px 9px; border: 1px solid var(--control-line); border-radius: var(--control-radius); color: var(--muted); cursor: pointer; list-style: none; font-size: 11px; }
.data-note summary::-webkit-details-marker { display: none; }
.data-note summary::before { content: "i"; display: grid; place-items: center; width: 13px; height: 13px; border: 1px solid currentColor; border-radius: 50%; font-size: 9px; font-weight: 400; }
.data-note summary:hover, .data-note[open] summary { color: var(--text); background: var(--bg); }
.data-note p { max-width: 68rem; margin: 10px 0 0; padding: 12px 14px; border-left: 2px solid var(--control-line); background: var(--bg); font-size: 12px; line-height: 1.8; }
.admin-tools .data-note, .billing-tools .data-note { margin: 0; }
.admin-tools .data-note[open], .billing-tools .data-note[open] { flex-basis: 100%; }
.service-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.service-card { min-width: 0; padding: 0 20px; border-right: 1px solid var(--line); }
.service-card:first-child { padding-left: 0; }
.service-card:last-child { padding-right: 0; border: 0; }
.service-card > div { display: flex; align-items: flex-start; flex-direction: column; gap: 14px; font-size: 14px; font-weight: 400; }
.service-card .small { margin: 12px 0 0; color: var(--muted); font: 400 11px/1.6 var(--font-mono); }
.usage-breakdown { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 24px; }
.usage-breakdown .small, .usage-breakdown .data-note { grid-column: 1 / -1; margin: 0; }
.table-scroll { max-width: 100%; overflow-x: auto; border: 1px solid var(--line); border-radius: 0; }
.directory-panel > .table-scroll, .billing-panel > .table-scroll { border-inline: 0; border-radius: 0; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table-wide table { min-width: 600px; }
.compact-table table, .billing-table table { min-width: 680px; }
th, td { padding: 16px 20px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: middle; }
th { background: #f5f7f6; color: var(--muted); font: 400 11px/1.7 var(--font-mono); letter-spacing: 0.025em; white-space: nowrap; }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: #fafbfb; }
td { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
td a { color: var(--text); font-weight: 400; text-decoration: none; }
td a:hover { color: var(--accent); text-decoration: underline; }
.directory-panel th:first-child, .directory-panel td:first-child, .billing-panel th:first-child, .billing-panel td:first-child { padding-left: 24px; }
.directory-panel th:last-child, .directory-panel td:last-child, .billing-panel th:last-child, .billing-panel td:last-child { padding-right: 24px; }
.compact-table th:last-child, .billing-table th:last-child { width: 110px; text-align: right; }
.compact-table tr:not(.billing-detail-row) > td:last-child, .billing-table tr:not(.billing-detail-row) > td:last-child { text-align: right; }
.record-link { display: inline-flex; align-items: center; gap: 11px; }
.record-avatar { display: grid; place-items: center; flex-shrink: 0; width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 2px; background: #f3f5f4; color: var(--muted); font: 400 11px/1 var(--font-mono); }
.record-link > span:last-child { min-width: 0; overflow-wrap: anywhere; }
.row-details::after { content: ""; width: 5px; height: 5px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(45deg); margin: -3px 1px 0 3px; }
.row-details[aria-expanded="true"] { color: var(--accent); border-color: var(--accent); background: var(--raised); }
.row-details[aria-expanded="true"]::after { transform: rotate(225deg); margin-top: 2px; }
.row-details.has-issue::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: var(--danger); }
.billing-detail-row, .billing-detail-row:hover { background: #f7faf8; }
.billing-detail-row > td { padding: 24px; text-align: left; border-bottom: 1px solid var(--line); }
.facts.billing-detail-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; }
.badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border: 1px solid #dce1e3; border-radius: 3px; background: #f6f7f8; color: #515c62; font: 400 11px/1.4 var(--font-mono); white-space: nowrap; }
.badge-starter, .badge-pro { color: #146c52; background: #edf6f1; border-color: #c8e2d4; }
.badge-ultra { color: #66518a; background: #f4f0f9; border-color: #ded5eb; }
.badge-grant { color: #845816; background: #fff7e9; border-color: #ecdbb8; }
.badge-warning { color: var(--danger); background: var(--danger-bg); border-color: #e9bbc0; }
.badge-healthy { color: var(--success); background: var(--success-bg); border-color: #c8e2d4; }
.plan-cell { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.pager { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.pager p { margin: 0 auto 0 0; color: var(--muted); font-size: 12px; }
.directory-panel > .pager, .billing-panel > .pager { margin: 0; padding: 18px 24px; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px 24px; margin: 0; padding: 0; }
.facts > div { min-width: 0; }
.facts dt { margin-bottom: 7px; color: var(--muted); font: 400 11px/1.6 var(--font-mono); }
.facts dd { margin: 0; font-size: 14px; overflow-wrap: anywhere; }
.panel-layout .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.panel-layout .facts dd { font-size: 24px; font-weight: 400; letter-spacing: -0.035em; }
.profile-facts-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; }
.profile-facts-grid > section { min-width: 0; }
.profile-facts-grid > section + section { padding-left: 28px; border-left: 1px solid var(--line); }
.profile-facts-grid h3 { margin: 0 0 22px; padding-bottom: 12px; border-bottom: 1px solid var(--line); font: 400 11px/1.6 var(--font-mono); }
.profile-card .facts { grid-template-columns: minmax(0, 1fr); gap: 18px; }
.profile-card > h2 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-bottom: 22px; border-bottom: 1px solid var(--line); font-size: 25px; }
.profile-card > h2 .record-avatar { width: 42px; height: 42px; font-size: 15px; margin-right: 4px; }
main[data-view="user"] .section-stack { grid-template-columns: minmax(250px, 1fr) minmax(0, 2.5fr); align-items: start; }
main[data-view="workspace"] .section-stack { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; }
main[data-view="workspace"] .section-stack > .panel:first-child, main[data-view="workspace"] .section-stack > .panel:last-child { grid-column: 1 / -1; }
.plan-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 20px; }
.back { margin-bottom: 24px; font-size: 11px; min-height: 32px; padding: 5px 10px; }
.billing-history { margin-top: 24px; }
.load-state, .empty-state { display: grid; justify-items: center; gap: 14px; padding: 56px 24px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); color: var(--muted); font-size: 13px; text-align: center; }
.panel .empty-state { border: 0; padding: 40px 20px; }
.load-state > p, .empty-state > p { margin: 0; }
.loading-indicator { width: 22px; height: 22px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; }
.login-body { display: grid; align-content: center; justify-items: center; gap: 28px; min-height: 100dvh; padding: 48px 24px; background-color: var(--bg); background-image: linear-gradient(#dfe3e280 1px, transparent 1px), linear-gradient(90deg, #dfe3e280 1px, transparent 1px); background-size: 96px 96px; }
.login-brand .brand { font-size: 23px; }
.login-brand .brand-symbol { width: 38px; height: 38px; }
.login-card { width: min(100%, 440px); padding: 40px; background: var(--panel); border: 1px solid var(--line); border-top: 2px solid var(--accent); border-radius: 2px; }
.login-card h1 { margin: 0 0 14px; font-size: 36px; font-weight: 400; line-height: 1.15; letter-spacing: -0.04em; }
.login-card > p { color: var(--muted); font-size: 13px; line-height: 1.8; }
.login-card > .error { color: var(--danger); }
.login-card form { display: grid; gap: 20px; margin-top: 28px; }
.login-card label { display: grid; gap: 8px; color: var(--muted); font: 400 11px/1.6 var(--font-mono); }
.login-card input { min-height: 42px; font-size: 14px; }
.login-card button { min-height: 42px; width: 100%; margin-top: 4px; }
.login-card .small { margin: 24px 0 0; padding-top: 20px; border-top: 1px solid var(--line); font: 400 11px/1.6 var(--font-mono); }
.login-footer { margin: 0; color: var(--muted); font: 400 11px/1.7 var(--font-mono); text-align: center; }

.masthead-label { padding-left: 24px; border-left: 1px solid var(--line); color: var(--muted); font: 400 11px/1.5 var(--font-mono); }
.operator-label { color: var(--muted); font: 400 11px/1.5 var(--font-mono); }
.console-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 48px; max-width: 1760px; margin: auto; padding: 0 48px; }
.console-index { align-self: start; position: sticky; top: 0; padding: 42px 0 28px; }
.index-label { margin: 0 0 32px; color: var(--muted); font: 400 11px/1.5 var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
.nav-label { margin: 0 0 8px; color: var(--muted); font: 400 10px/1.7 var(--font-mono); letter-spacing: 0.025em; text-transform: uppercase; }
.nav-number { color: var(--muted); font: 400 11px/1.4 var(--font-mono); }
.nav-arrow { visibility: hidden; color: var(--accent); font-size: 15px; }
.nav-active .nav-arrow, .console-nav a:hover .nav-arrow { visibility: visible; }
.nav-active .nav-number { color: var(--accent); }
.index-footer { display: grid; gap: 18px; margin-top: 64px; color: var(--muted); font: 400 11px/1.7 var(--font-mono); }
.index-line { width: 24px; height: 2px; background: var(--accent); }
.page-eyebrow > span { color: var(--accent); }
.page-register { padding-bottom: 5px; color: var(--muted); font: 400 11px/1.6 var(--font-mono); }
.directory-panel > h2::before, .billing-panel > h2::before { content: ""; width: 6px; height: 6px; border: 1px solid var(--accent); }
.service-panel > h2 { padding-bottom: 18px; border-bottom: 1px solid var(--line); }
.usage-panel .table-scroll, .github-panel .table-scroll, .metrics-panel .table-scroll, .attention-panel .table-scroll { border-inline: 0; }
.usage-panel th, .usage-panel td, .github-panel th, .github-panel td, .metrics-panel th, .metrics-panel td, .attention-panel th, .attention-panel td { padding-inline: 10px; }
.metrics-panel > .table-scroll + .table-scroll { margin-top: 16px; }
.login-card > .auth-eyebrow { margin: 0 0 22px; color: var(--accent); font: 400 11px/1.5 var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; }
@keyframes admin-spin { to { transform: rotate(360deg); } }
@keyframes admin-enter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: no-preference) {
  .btn, .plan-btn, .row-details, .console-nav a, .signout, input, select { transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease; }
  .page-header, .login-card { animation: admin-enter 240ms ease both; }
  #content > .admin-stats { animation: admin-enter 240ms 30ms ease both; }
  #content > .panel-layout, #content > .section-stack, #content > .billing-panel, #content > .profile-card { animation: admin-enter 240ms 60ms ease both; }
  .loading-indicator { animation: admin-spin 800ms linear infinite; }
}
@media (max-width: 1320px) {
  .console-header-inner { padding-inline: 32px; }
  .console-layout { grid-template-columns: 164px minmax(0, 1fr); gap: 32px; padding-inline: 32px; }
  .admin-stats > div { padding-inline: 20px; }
  .panel-layout > .attention-panel, .panel-layout > .usage-panel, .panel-layout > .github-panel, .panel-layout > .metrics-panel { grid-column: span 6; }
  .usage-breakdown { grid-template-columns: minmax(0, 1fr); }
  .service-card { padding-inline: 12px; }
  .service-card .badge { font-size: 11px; }
  main[data-view="user"] .section-stack { grid-template-columns: minmax(0, 1fr); }
  .plan-row { display: flex; flex-wrap: wrap; }
}
@media (max-width: 1050px) {
  .console-header-inner { min-height: 74px; }
  .console-layout { display: block; }
  .console-index { position: static; padding: 20px 0 0; }
  .console-nav { display: flex; gap: 4px; overflow-x: auto; padding: 0 0 14px; border-bottom: 1px solid var(--line); }
  .nav-group { display: contents; }
  .console-nav a { display: flex; flex-shrink: 0; gap: 8px; min-height: 36px; padding: 7px 10px; margin: 0; border-left: 0; border-bottom: 2px solid transparent; font-size: 12px; }
  .console-nav a.nav-active { border-bottom-color: var(--accent); }
  .nav-arrow, .nav-label, .index-label, .index-footer { display: none; }
  main#app { padding-top: 28px; }
  .profile-facts-grid { gap: 20px; }
  .profile-facts-grid > section + section { padding-left: 20px; }
  .facts.billing-detail-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .console-header-inner { padding-inline: 20px; gap: 16px; }
  .brand { font-size: 24px; }
  .masthead-label { font-size: 10px; padding-left: 16px; }
  .operator-label { display: none; }
  .console-layout { padding-inline: 20px; }
  .page-header { margin-bottom: 28px; }
  .page-header h1 { font-size: 37px; }
  .page-register { display: none; }
  .admin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 0; margin-bottom: 24px; padding-block: 24px; }
  .admin-stats > div { padding: 0 20px; }
  .admin-stats > div:nth-child(odd) { padding-left: 0; }
  .admin-stats > div:nth-child(even) { border: 0; }
  .admin-stats dd { font-size: 34px; }
  .panel-layout > .panel { grid-column: 1 / -1; }
  .panel, .card { padding: 20px; }
  .directory-panel, .billing-panel { padding: 0; }
  .directory-panel > h2, .billing-panel > h2 { padding: 20px; }
  .directory-panel > .admin-toolbar, .billing-toolbar { padding: 18px 20px; }
  .admin-toolbar, .billing-toolbar { align-items: stretch; gap: 16px; }
  .admin-tools, .billing-tools { width: 100%; margin-left: 0; }
  .view-updated { margin-right: auto; }
  .filter-form { width: 100%; gap: 12px; }
  .filter-form label { flex: 1 1 130px; }
  .filter-form input[type="text"], .filter-form select { width: 100%; max-width: 100%; }
  .filter-actions { flex-basis: 100%; }
  .filter-actions .btn { flex: 1; }
  .service-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 0; }
  .service-card { padding: 0 16px; }
  .service-card:nth-child(odd) { padding-left: 0; border-right: 1px solid var(--line); }
  .service-card:nth-child(even) { padding-left: 16px; border: 0; }
  .service-card:last-child { border: 0; }
  .service-card .badge { font-size: 11px; }
  .panel-layout .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .profile-facts-grid { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .profile-facts-grid > section + section { padding: 24px 0 0; border-left: 0; border-top: 1px solid var(--line); }
  main[data-view="workspace"] .section-stack { grid-template-columns: minmax(0, 1fr); }
  .facts { gap: 18px; }
  .pager p { flex-basis: 100%; margin-bottom: 4px; }
  .directory-panel > .pager, .billing-panel > .pager { padding: 18px 20px; }
  .login-card { padding: 32px 24px; }
}
@media (max-width: 390px) { .masthead-label { display: none; } .console-layout { padding-inline: 16px; } .page-header h1 { font-size: 34px; } .admin-stats dt { font-size: 11px; } }
`;

export const ADMIN_JS = `
(() => {
  "use strict";

  const PLAN_IDS = ["free", "starter", "pro", "ultra"];
  const EXPIRED = "Session expired — reopen the admin login URL (with its key) to sign in again.";

  const app = document.getElementById("app");
  const noticeEl = document.getElementById("notice");
  const content = document.getElementById("content");

  function setNotice(message, tone = "info") {
    noticeEl.dataset.tone = tone;
    noticeEl.textContent = message;
  }

  function loading(message) {
    content.textContent = "";
    const state = document.createElement("div"); state.className = "load-state";
    const indicator = document.createElement("span"); indicator.className = "loading-indicator"; indicator.setAttribute("aria-hidden", "true");
    const label = document.createElement("span"); label.textContent = message;
    state.append(indicator, label); content.append(state);
  }

  function unavailable(message, reload) {
    content.textContent = "";
    const state = document.createElement("div"); state.className = "empty-state";
    const label = document.createElement("p"); label.textContent = message;
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "btn btn-secondary"; retry.textContent = "Try again";
    retry.addEventListener("click", () => { void reload(); });
    state.append(label, retry); content.append(state);
  }

  function emptyState(message) {
    const state = document.createElement("p"); state.className = "empty-state"; state.textContent = message; return state;
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

  function expandableTable(headers, records) {
    const wrapper = table([...headers, "Details"], []); wrapper.className += " compact-table";
    const el = wrapper.children[0]; const body = el.children[1];
    for (const [index, record] of records.entries()) {
      const row = document.createElement("tr"); const detail = document.createElement("tr");
      detail.className = "billing-detail-row"; detail.hidden = true; detail.id = "row-detail-" + app.dataset.view + "-" + index;
      const detailCell = document.createElement("td"); detailCell.colSpan = headers.length + 1;
      const facts = document.createElement("dl"); facts.className = "facts billing-detail-facts";
      for (const [label, value] of record.details) facts.append(fact(label, value));
      detailCell.append(facts); detail.append(detailCell);
      const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "row-details" + (record.issue ? " has-issue" : ""); toggle.textContent = "Details";
      toggle.setAttribute("aria-label", "Details for " + record.label); toggle.setAttribute("aria-controls", detail.id); toggle.setAttribute("aria-expanded", "false");
      if (record.issue) toggle.title = "Needs attention";
      toggle.addEventListener("click", () => { detail.hidden = !detail.hidden; toggle.setAttribute("aria-expanded", String(!detail.hidden)); toggle.textContent = detail.hidden ? "Details" : "Close"; });
      for (const value of [...record.values, toggle]) { const td = document.createElement("td"); if (typeof value === "string") td.textContent = value; else td.append(value); row.append(td); }
      body.append(row, detail);
    }
    return wrapper;
  }

  function link(href, text) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    return a;
  }

  function recordAvatar(name) {
    const avatar = document.createElement("span"); avatar.className = "record-avatar"; avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = Array.from(String(name).trim()).slice(0, 2).join("").toUpperCase(); return avatar;
  }

  function recordLink(href, name) {
    const anchor = link(href, ""); anchor.className = "record-link";
    const label = document.createElement("span"); label.textContent = name;
    anchor.append(recordAvatar(name), label); return anchor;
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
      setNotice(EXPIRED, "error");
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message =
        body && typeof body.message === "string" ? body.message : "request failed (" + res.status + ")";
      setNotice(message, "error");
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
    const listView = ["attention", "users", "workspaces", "audit"].includes(app.dataset.view);
    const toolbar = listView ? Array.from(content.children).find(node => node.className?.includes("admin-toolbar")) : undefined;
    let panel;
    for (const node of Array.from(content.children)) {
      if (node.tagName && node.tagName.toLowerCase() === "h2") {
        panel = document.createElement("section");
        panel.className = "panel" + (listView ? " directory-panel" : "");
        if (app.dataset.view === "overview") {
          const sections = { "Service health": "service-panel", "Needs attention": "attention-panel", "Usage": "usage-panel", "GitHub": "github-panel", "API & billing · 60 min": "metrics-panel" };
          if (sections[node.textContent]) panel.className += " " + sections[node.textContent];
        }
        panel.setAttribute("aria-label", node.textContent);
        if (app.dataset.view === "overview" && node.textContent === "Usage") panel.className += " panel-wide";
        panel.append(node);
        if (toolbar && !layout.children.length) panel.append(toolbar);
        layout.append(panel);
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

  function count(value) { return value === null || value === undefined ? "—" : String(value); }
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
  function timestamp(value) { return value ? when(value) : "—"; }
  function bytes(value) {
    if (!Number.isFinite(value)) return "Unavailable";
    if (value < 1024) return value + " B";
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KiB";
    if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MiB";
    return (value / (1024 * 1024 * 1024)).toFixed(1) + " GiB";
  }

  function statCards(items) {
    const stats = document.createElement("dl"); stats.className = "admin-stats";
    for (const [label, value] of items) {
      const item = fact(label, value === null || value === undefined ? "—" : String(value));
      if (String(value ?? "").length > 12) item.className = "stat-long";
      if (value === null || value === undefined) item.title = "No verified count available";
      stats.append(item);
    }
    content.append(stats); return stats;
  }

  function pageToolbar(reload, checkedAt, fields = [], path = "", info = "") {
    const toolbar = document.createElement("div"); toolbar.className = "admin-toolbar" + (fields.length ? " has-filters" : "");
    if (fields.length) filters(fields.map(field => ({ ...field, compact: field.type !== "date", placeholder: field.placeholder || field.label })), path, toolbar);
    const tools = document.createElement("div"); tools.className = "admin-tools";
    const updated = document.createElement("time"); updated.className = "view-updated";
    const at = checkedAt || new Date().toISOString(); updated.dateTime = at;
    updated.textContent = "View updated " + new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    updated.title = when(at) + " — page snapshot, not provider verification";
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "btn btn-secondary"; refresh.textContent = "Refresh"; refresh.addEventListener("click", () => { void reload(); });
    tools.append(updated, refresh); if (info) tools.append(dataNote(info, "Info"));
    // Keep the action row together when a larger filter form wraps.
    if (fields.length > 3) toolbar.children[0].append(tools);
    else toolbar.append(tools);
    content.append(toolbar); return toolbar;
  }

  async function loadOverview() {
    loading("Checking service health…");
    let data;
    try { data = await getJSON("/api/overview"); }
    catch { unavailable("Monitoring unavailable. No current snapshot.", loadOverview); return; }
    content.textContent = "";
    setNotice("");
    const usageTotals = data.snapshot?.usage;
    statCards([["Users", usageTotals?.users], ["Workspaces", usageTotals?.workspaces], ["Tasks", usageTotals?.tasks], ["Files", usageTotals?.attachments]]);
    pageToolbar(loadOverview, data.checked_at, [], "", "Backend " + data.version + " · " + data.deploy_mode + " · uptime " + data.uptime_seconds + "s. Only database and Redis are probed; other services show configuration. Counts are stored observations, not revenue. Unavailable counts are unknown, not zero.");
    heading("Service health");
    const health = data.health;
    const services = document.createElement("div"); services.className = "service-grid";
    for (const [name, status, detail] of [
      ["Database", serviceStatus(health.database.status), health.database.latency_ms === null ? "Probe failed or timed out" : "SELECT 1 · " + health.database.latency_ms + "ms"],
      ["Redis", serviceStatus(health.redis.status), health.redis.latency_ms === null ? "Probe failed or timed out" : "PING · " + health.redis.latency_ms + "ms"],
      ["Storage", serviceStatus(health.storage.status), "Config only"],
      ["Billing", serviceStatus(health.billing.configured ? "configured" : "not_configured"), "Config only"],
      ["GitHub", serviceStatus(health.github.configured ? health.github.webhook_configured ? "configured" : "webhook_missing" : "not_configured"), "Config only"],
    ]) { const card = document.createElement("div"); card.className = "service-card"; const row = document.createElement("div"); row.append(name, status); card.append(row, paragraph(detail)); services.append(card); }
    content.append(services);
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
      facts.append(fact("Signups · 7 days", count(usage.signups_7d)), fact("Storage", bytes(usage.storage_bytes)), fact("Grants", count(usage.operator_grants)));
      card.append(facts);
      content.append(card);
      content.append(table(["Effective plan", "Users"], usage.plans.map(row => [String(row.plan), count(row.count)])));
      content.append(dataNote("Effective plans include operator grants; these are not subscription or revenue counts."));
      content.append(table(["Task status", "Tasks"], usage.task_statuses.map(row => [String(row.status), count(row.count)])));
      heading("GitHub");
      const github = snapshot.github;
      content.append(table(["Metric", "Value"], [
        ["Connected accounts", count(github.connections)], ["Active repo links", count(github.active_repository_associations)],
        ["Queued jobs", count(github.queued)], ["Oldest pending job", timestamp(github.oldest_pending_at)], ["Last issue sync", timestamp(github.last_synced_at)],
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
      const text = document.createElement("span"); text.textContent = field.label; label.append(text);
      const input = document.createElement(field.options ? "select" : "input");
      input.name = field.name;
      if (field.compact) input.setAttribute("aria-label", field.label);
      if (field.options) for (const value of field.options) {
        const option = document.createElement("option"); option.value = value; option.textContent = field.optionLabels?.[value] || (value ? value.replaceAll("_", " ") : field.emptyLabel || "All"); option.selected = value === (params.get(field.name) || ""); input.append(option);
      } else { input.type = field.type || "text"; input.maxLength = 100; input.value = params.get(field.name) || ""; if (field.placeholder) input.placeholder = field.placeholder; }
      label.append(input); form.append(label);
    }
    const submit = document.createElement("button"); submit.type = "submit"; submit.className = "btn btn-primary"; submit.textContent = "Apply filters";
    const clear = link(path, "Clear filters"); clear.className = "btn btn-secondary";
    const actions = document.createElement("div"); actions.className = "filter-actions"; actions.append(submit, clear);
    form.append(actions); target.append(form);
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
    const pageLink = (page, label) => { const item = link(destination(page), label); item.className = "btn btn-secondary btn-sm"; return item; };
    if (data.page > 1) row.append(pageLink(data.page - 1, "Previous"));
    row.append(paragraph(data.total === 0 ? "0 records" : "Page " + data.page + " · " + data.total + " records"));
    if (data.page * data.page_size < data.total) row.append(pageLink(data.page + 1, "Next"));
    target.append(row);
  }

  async function loadAttention() {
    loading("Loading queued problems…");
    const page = new URL(window.location.href).searchParams.get("page") || "1";
    let data;
    try { data = await getJSON("/api/attention?page=" + encodeURIComponent(page)); }
    catch { unavailable("Queue details unavailable.", loadAttention); return; }
    content.textContent = "";
    setNotice("");
    statCards([["Queued problems", data.total], ["Jobs · page", data.jobs.length], ["Retries · page", data.jobs.filter(job => job.error_code !== null).length], ["Attempts · page", data.jobs.reduce((sum, job) => sum + job.attempts, 0)]]);
    pageToolbar(loadAttention, data.checked_at, [], "", "Jobs awaiting retry or pending over five minutes, oldest first. Page counts cover visible jobs; queued problems covers all matches. Delivery IDs correlate with GitHub deliveries and backend logs. No payloads or task content are shown. Account and billing flags are in Overview.");
    heading("GitHub queue");
    content.append(expandableTable(["Job", "Type", "Attempts", "Retry at"], data.jobs.map(job => ({ label: String(job.id), issue: job.error_code !== null, values: [String(job.id).slice(0, 8), String(job.kind), count(job.attempts), when(job.retry_at)], details: [["Job ID", String(job.id)], ["Delivery ID", job.delivery_id || "—"], ["Created", when(job.created_at)], ["Lease ends", timestamp(job.locked_until)], ["Error", job.error_code || "Pending"]] }))));
    if (!data.jobs.length) content.append(emptyState(data.total ? "No jobs on this page. Use Previous to return." : "No jobs need attention."));
    pagination(data, "/attention");
    groupSections();
  }

  async function loadAudit() {
    loading("Loading audit trail…");
    let data;
    try { data = await getJSON("/api/audit?" + new URL(window.location.href).searchParams); }
    catch { unavailable("Audit records unavailable.", loadAudit); return; }
    content.textContent = "";
    setNotice("");
    statCards([["Changes", data.total], ["Events · page", data.events.length], ["Operators · page", new Set(data.events.map(event => event.actor)).size], ["Deleted targets · page", data.events.filter(event => !event.target_user_id).length]]);
    pageToolbar(loadAudit, data.checked_at, [{ name: "actor", label: "Operator" }, { name: "user", label: "User name or ID" }, { name: "action", label: "Action", options: ["", "plan_override_changed"] }, { name: "from", label: "From (UTC)", type: "date" }, { name: "to", label: "Through (UTC)", type: "date" }], "/audit", "Changes covers all matching events; other cards cover the current page. Deleted targets counts events, not unique people. Date filters are inclusive UTC days. Only changes made after monitoring was deployed are recorded. One operator account identifies the account, not individual people sharing it. Revoking a grant never cancels a Stripe subscription.");
    heading("Change history");
    content.append(expandableTable(["When", "Operator", "Account", "Grant"], data.events.map(event => ({ label: String(event.target_username), values: [when(event.created_at), String(event.actor), event.target_user_id ? link("/users/" + encodeURIComponent(event.target_user_id), String(event.target_username)) : String(event.target_username) + " (deleted)", (event.from_plan || "—") + " → " + (event.to_plan || "—")], details: [["Action", String(event.action)], ["Previous grant", event.from_plan || "—"], ["New grant", event.to_plan || "—"]] }))));
    if (!data.events.length) content.append(emptyState(data.total ? "No events on this page. Use Previous to return." : "No operator plan changes recorded yet."));
    pagination(data, "/audit");
    groupSections();
  }

  async function loadWorkspaces() {
    loading("Loading workspace support…");
    let data;
    try { data = await getJSON("/api/workspaces?" + new URL(window.location.href).searchParams); }
    catch { unavailable("Workspace support unavailable.", loadWorkspaces); return; }
    content.textContent = "";
    setNotice("");
    statCards([["Workspaces", data.total], ["Members · page", data.workspaces.reduce((sum, workspace) => sum + workspace.members, 0)], ["Tasks · page", data.workspaces.reduce((sum, workspace) => sum + workspace.tasks, 0)], ["Files · page", data.workspaces.reduce((sum, workspace) => sum + workspace.files, 0)]]);
    pageToolbar(loadWorkspaces, data.checked_at, [{ name: "q", label: "Workspace, slug or owner", placeholder: "Search workspaces" }], "/workspaces", "Workspaces covers all matches; usage cards total this page only. Membership counts are not unique people. Limits follow the owner's effective plan and deployment mode. Tasks have no plan quota. Storage includes recorded attachments and logos, not orphaned bucket objects.");
    heading("Workspace directory");
    content.append(expandableTable(["Workspace", "Owner", "Plan", "Members"], data.workspaces.map(workspace => ({ label: workspace.name, values: [recordLink("/workspaces/" + workspace.id, workspace.name), link("/users/" + workspace.owner.id, workspace.owner.username), badge(workspace.plan), quota(workspace.members, workspace.limits.members, false)], details: [["Kind", workspace.kind], ["Tasks", count(workspace.tasks)], ["Files", count(workspace.files)], ["Storage", quota(workspace.storage_bytes, workspace.limits.storage_bytes, true)]] }))));
    if (!data.workspaces.length) content.append(emptyState("No workspaces match this page/filter."));
    pagination(data, "/workspaces");
    groupSections();
  }

  async function loadWorkspace(id) {
    loading("Loading workspace support…");
    let data;
    try { data = await getJSON("/api/workspaces/" + encodeURIComponent(id)); }
    catch { unavailable("Workspace details unavailable.", () => loadWorkspace(id)); return; }
    content.textContent = "";
    setNotice("");
    const back = link("/workspaces", "← All workspaces"); back.className = "back"; content.append(back);
    const workspace = data.workspace;
    statCards([["Members", quota(workspace.members.length, workspace.limits.members, false)], ["Tasks", workspace.tasks], ["Files", workspace.files], ["Storage", quota(workspace.storage_bytes, workspace.limits.storage_bytes, true)]]);
    pageToolbar(() => loadWorkspace(id), data.checked_at, [], "", "Limits follow the owner's effective plan and deployment mode. Tasks are uncapped; storage is recorded attachments/logos, not bucket inventory.");
    heading(workspace.name);
    const card = document.createElement("section"); card.className = "card profile-card";
    const grid = document.createElement("div"); grid.className = "profile-facts-grid";
    const sections = [
      ["Workspace", [["Slug / kind", workspace.slug + " / " + workspace.kind], ["Owner", workspace.owner.username], ["Effective / Stripe plan", workspace.plan + " / " + workspace.stripe_plan], ["Operator grant", workspace.plan_override || "—"]]],
      ["Capacity", [["Owner team slots", quota(workspace.owner_team_count, workspace.limits.teams, false)], ["Maximum file size", workspace.limits.max_file_bytes === null ? "Unlimited" : bytes(workspace.limits.max_file_bytes)]]],
      ["Owner GitHub", [["Connection", workspace.github.owner_connection ? workspace.github.owner_connection.status : "Not connected"], ["Last verified", workspace.github.owner_connection ? when(workspace.github.owner_connection.verified_at) : "Not verified"]]],
    ];
    for (const [label, fields] of sections) { const section = document.createElement("section"); const title = document.createElement("h3"); title.textContent = label; const facts = document.createElement("dl"); facts.className = "facts"; for (const [name, value] of fields) facts.append(fact(name, value)); section.append(title, facts); grid.append(section); }
    card.append(grid); content.append(card);
    heading("Members");
    content.append(table(["User", "Role", "Joined"], workspace.members.map(member => [link("/users/" + member.id, member.username), String(member.role), when(member.joined_at)])));
    heading("Task activity");
    content.append(table(["Status", "Count"], workspace.task_statuses.map(row => [row.status, count(row.count)])));
    heading("Workspace GitHub links");
    content.append(dataNote("Owner connection is personal; workspace issue links can be published by other members. No credentials or repository names are shown."));
    content.append(table(["Publication", "Sync", "Count"], workspace.github.issue_links.map(row => [row.publication_status, row.sync_status, count(row.count)])));
    if (!workspace.github.issue_links.length) content.append(emptyState("No GitHub issue links recorded."));
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
      for (const value of [recordLink("/users/" + user.id, user.username), plan, status, user.verified_at ? when(user.verified_at) : "Not verified", toggle]) {
        const td = document.createElement("td"); if (typeof value === "string") td.textContent = value; else td.append(value); row.append(td);
      }
      body.append(row, detailRow);
    }
    el.append(thead, body); wrapper.append(el); return wrapper;
  }

  async function loadBilling() {
    loading("Loading billing…");
    const params = new URL(window.location.href).searchParams;
    const query = new URLSearchParams();
    for (const key of ["page", "q", "status"]) if (params.get(key)) query.set(key, params.get(key));
    const historyQuery = new URLSearchParams(); historyQuery.set("page", params.get("history_page") || "1"); if (params.get("q")) historyQuery.set("q", params.get("q"));
    let data;
    try { data = await getJSON("/api/billing?" + query); }
    catch { unavailable("Billing unavailable.", loadBilling); return; }
    content.textContent = ""; setNotice("");
    let summary = data.summary;
    if (!summary) {
      let complete = data.users;
      if (complete.length !== data.total && data.total <= data.page_size) {
        const firstQuery = new URLSearchParams(query); firstQuery.set("page", "1");
        try { complete = (await getJSON("/api/billing?" + firstQuery)).users; } catch { complete = []; }
      }
      summary = { accounts: data.total, active_subscriptions: null, grants: null, sync_issues: null };
      if (complete.length === data.total && complete.every(user => typeof user.subscription_status === "string" && "operator_grant" in user && "error_code" in user)) {
        summary.active_subscriptions = complete.filter(user => user.subscription_status === "active").length;
        summary.grants = complete.filter(user => user.operator_grant != null).length;
        summary.sync_issues = complete.filter(user => user.error_code != null).length;
      } else if (noticeEl.textContent !== EXPIRED) setNotice("Billing totals need the current backend image. Redeploy backend and admin together.");
    }
    const ratio = value => value === null || value === undefined ? null : value + " / " + summary.accounts;
    const stats = statCards([["Accounts", summary.accounts], ["Active subscriptions", ratio(summary.active_subscriptions)], ["Grants", ratio(summary.grants)], ["Sync issues", ratio(summary.sync_issues)]]); stats.setAttribute("aria-label", "Matching account totals");
    const panel = document.createElement("section"); panel.className = "panel billing-panel"; panel.setAttribute("aria-label", "Subscriptions");
    const title = document.createElement("h2"); title.textContent = "Accounts"; panel.append(title);
    const toolbar = document.createElement("div"); toolbar.className = "billing-toolbar";
    filters([{ name: "q", label: "User", placeholder: "Search accounts", compact: true }, { name: "status", label: "Status", compact: true, emptyLabel: "All statuses", optionLabels: { unknown: "Not verified", error: "Sync issues", grant: "Grants" }, options: ["", "unknown", "none", "active", "trialing", "past_due", "unpaid", "canceled", "paused", "incomplete", "incomplete_expired", "error", "canceling", "payment_failed", "grant"] }], "/billing", toolbar);
    const tools = document.createElement("div"); tools.className = "billing-tools";
    const updated = document.createElement("time"); updated.className = "view-updated"; updated.dateTime = data.checked_at;
    updated.textContent = "View updated " + new Date(data.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); updated.title = when(data.checked_at) + " — page snapshot, not Stripe verification";
    const refresh = document.createElement("button"); refresh.type = "button"; refresh.className = "btn btn-secondary"; refresh.textContent = "Refresh"; refresh.addEventListener("click", () => { void loadBilling(); });
    const info = dataNote("Billing " + (data.configured ? "enabled" : "disabled") + ". Counts cover all matching accounts, not just this page. Active subscriptions are last observed active statuses, not proof of payment. Sync issues count accounts with a last reconciliation error; unassigned failures remain in history. Unknown means not verified since monitoring began. Grants are not subscriptions. Stripe updates only through existing webhooks/user sync; view updated is the page snapshot time. Last invoice event is a notification, not complete payment history.", "Info");
    tools.append(updated, refresh, info); toolbar.append(tools); panel.append(toolbar, billingAccountsTable(data.users));
    if (!data.users.length) panel.append(emptyState(data.total ? "No accounts on this page." : "No matching accounts."));
    pagination(data, "/billing", "page", panel); content.append(panel);
    const historyPanel = document.createElement("section"); historyPanel.className = "panel billing-history";
    const historyTitle = document.createElement("h2"); historyTitle.textContent = "Sync history"; historyPanel.append(historyTitle);
    historyPanel.append(dataNote("Post-deployment attempts only. History follows the user search, not the subscription-status filter; unassigned/deleted users appear when search is empty.")); content.append(historyPanel);
    let history;
    try { history = await getJSON("/api/billing/history?" + historyQuery); }
    catch { historyPanel.append(paragraph("Sync history unavailable.")); return; }
    historyPanel.append(table(["When", "Account", "Source", "Outcome", "Error"], history.events.map(event => [when(event.created_at), event.user ? link("/users/" + event.user.id, event.user.username) : "Unassigned / deleted", event.source, event.outcome, event.error_code || "—"])));
    if (!history.events.length) historyPanel.append(emptyState(history.total ? "No attempts on this page." : "No sync attempts."));
    pagination(history, "/billing", "history_page", historyPanel);
  }

  async function loadUsers() {
    loading("Loading users…");
    let data;
    try {
      data = await getJSON("/api/users");
    } catch {
      unavailable("Account directory unavailable.", loadUsers);
      return;
    }
    const users = Array.isArray(data.users) ? data.users : [];
    content.textContent = "";
    setNotice("");
    statCards([["Accounts", users.length], ["Grants", users.filter(user => user.plan_override != null).length], ["Needs attention", users.filter(user => user.attention_flags?.length).length], ["Workspaces", users.reduce((sum, user) => sum + user.workspaces, 0)]]);
    pageToolbar(loadUsers, data.checked_at, [], "", "Counts cover this complete account directory. Attention flags may overlap; plans include operator grants and are not revenue.");
    heading("Account directory");
    if (users.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No users yet.";
      content.append(empty);
      groupSections();
      return;
    }
    const rows = users.map(u => ({ label: u.username, issue: Boolean(u.attention_flags?.length), values: [recordLink("/users/" + encodeURIComponent(u.id), String(u.username)), planCell(u), String(u.workspaces), when(u.created_at)], details: [["Display name", u.display_name || "—"], ["Attention flags", u.attention_flags?.length ? u.attention_flags.join(", ") : "None"]] }));
    content.append(expandableTable(["Account", "Plan", "Workspaces", "Created"], rows));
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
      setNotice(EXPIRED, "error");
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
    loading("Loading profile…");
    let data;
    try {
      data = await getJSON("/api/users/" + encodeURIComponent(id));
    } catch {
      unavailable("Account details unavailable.", () => loadUser(id));
      return;
    }
    const user = data.user;
    const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
    content.textContent = "";

    const back = link("/users", "← All users");
    back.className = "back";
    content.append(back);

    statCards([["Workspaces", data.total_workspaces], ["Active repositories", user.github ? user.github.active_repositories : 0], ["Links needing attention", user.github_issue_links_needing_attention], ["Operator grants", user.plan_override == null ? "0 / 1" : "1 / 1"]]);
    pageToolbar(() => loadUser(id), data.checked_at, [], "", "Plan includes operator grants. GitHub repository counts describe activated repositories, not provider-wide access. Revoke never cancels a subscription.");
    const card = document.createElement("section");
    card.className = "card profile-card";
    const h1 = document.createElement("h2");
    h1.append(recordAvatar(user.username), String(user.username), " ", badge(String(user.plan)));
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
      fact("Connection", user.github ? String(user.github.status) : "Not connected"),
      fact("Last verified", user.github ? when(user.github.verified_at) : "—"),
      fact("Active repositories", user.github ? count(user.github.active_repositories) : "0"),
      fact("Reauthorization", user.github ? user.github.reauthorization_required ? "Required" : "Current" : "—"),
      fact("Links needing attention", count(user.github_issue_links_needing_attention))
    );
    const identityFacts = document.createElement("dl"); identityFacts.className = "facts";
    const billingFacts = document.createElement("dl"); billingFacts.className = "facts";
    const integrationFacts = document.createElement("dl"); integrationFacts.className = "facts";
    const groups = [identityFacts, billingFacts, integrationFacts];
    for (const [index, field] of Array.from(facts.children).entries()) groups[index < 7 ? (index < 3 ? 1 : 0) : index < 10 ? 1 : 2].append(field);
    const grid = document.createElement("div"); grid.className = "profile-facts-grid";
    for (const [index, label] of ["Account", "Billing", "GitHub"].entries()) { const section = document.createElement("section"); const title = document.createElement("h3"); title.textContent = label; section.append(title, groups[index]); grid.append(section); }
    card.append(grid);
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
        button.textContent = "Revoke";
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
    wsHeading.textContent = "Workspaces";
    content.append(wsHeading);
    if (workspaces.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
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
