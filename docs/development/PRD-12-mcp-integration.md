# PRD-12 — MCP Integration (Personal Access Tokens → AI access)

> **Status: PARKED — future PRD, deliberately NOT next.** Idea recorded from
> the 2026-09-05 brainstorm so it survives; nothing designed in detail. It
> depends on PRD-11 (plans + entitlements) and is the Ultra anchor feature.

## 1. The idea

Expose Mokara to the user's own AI assistant (Claude, Cursor, ChatGPT, …) via
an MCP server: the AI creates, completes, assigns and queries tasks in natural
language — "add a task to fix the login bug, due Friday, assign to Mira",
"what's blocking Atlas Studio this week?", daily standup digests.

## 2. Why MCP and not built-in AI

**Zero LLM cost.** Built-in AI features (task breakdown, summaries) put every
inference on our bill — untenable at $4–18/mo. With MCP the intelligence runs
on the _user's own_ AI subscription; Mokara only exposes tools. We get
"AI-powered" as a headline with no inference bill, and it anchors the Ultra
tier instead of leaking value into free.

## 3. Prerequisite: personal access tokens

MCP clients cannot use cookie auth. Ships with a PAT system:

- user-scoped tokens with scopes (read / write / admin), revocable, hashed at
  rest, shown once;
- the same PATs later unlock the plain REST API + webhooks (Ultra features) —
  the infra is bought once and used three times.

## 4. Tier placement (proposed)

- **Ultra:** full MCP (read + write) + API + webhooks.
- **Pro:** read-only MCP (queries and digests, no mutations) — the "try it"
  tier.
- **Free / Starter:** none.
- **Self-hosted:** unrestricted — point any MCP client at your own instance
  with a local PAT. Open-core stays honest (PRD-11 §1).

## 5. Shape (when built)

- MCP server mounted on the backend (Hono) over the streamable HTTP transport;
  hosted gets the OAuth-protected endpoint, self-host uses PAT headers.
- Tools mirror the existing REST surface 1:1 (tasks CRUD, comments read,
  assignment, container listing, analytics read) — the API _is_ the tool spec;
  no new server logic, only auth + a thin protocol layer.
- Audit: token-scoped requests appear in the request log with the acting user.

## 6. Non-goals

- Built-in AI features of any kind (no LLM keys on our side).
- Writing an MCP client inside Mokara (the user brings their own AI).
- Real-time WS transport; streamable HTTP only.
- Any of this before PRD-11 exists.
