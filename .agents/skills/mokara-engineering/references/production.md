# Production engineering

Reviewed 2026-10-11. Apply relevant guidance when changing a feature or deployment path. These are recommendations to verify, not a claim that every capability already exists or permission to change live infrastructure.

## Configuration and exposure

[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) recommends a reverse proxy and explains environment/runtime and multi-instance concerns. In Mokara, keep `BACKEND_URL` server-side at runtime, preserve same-origin `/api`, and treat `NEXT_PUBLIC_*` values as public build-time configuration. Do not put credentials in bundles or image build arguments. Validate required runtime settings; keep optional integrations explicitly unavailable when incompletely configured. Follow existing trusted-ingress/IP and cookie policies rather than trusting arbitrary forwarded headers.

Keep user-specific responses out of shared caches. Review streaming/proxy buffering for SSE. Multi-instance cache coordination is relevant only if the deployment uses shared cached rendering; do not add a distributed cache to ordinary client state by default.

## Errors, logs and recovery

[OWASP logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) recommends useful diagnostic/security events while excluding credentials, session identifiers and sensitive data. Keep event code, operation, status and a safe correlation identifier where supported. Avoid raw request bodies, authorization headers, OAuth callback URLs and uncontrolled provider dumps. Redact and bound untrusted log fields. Do not expose `NormalizedError.cause` in the UI or send it to telemetry without sanitization. Recording a failure in several layers should not create duplicate reports.

Distinguish expected input/auth/conflict failures from unexpected server faults. Show safe actionable copy and preserve usable UI data. Retry only transient operations with bounded backoff; mutations need idempotency or explicit user retry. A rate limit, validation error or expired session should not start an unbounded retry loop. Do not let a telemetry failure break the original operation.

## Data and lifecycle

Use DB constraints and transactions for race-sensitive invariants. Use the existing durable integration patterns for work that must survive process termination. Provider calls need bounded timeouts and explicit retry ownership; avoid retry multiplication across proxy, API client and worker layers.

Distinguish process liveness from dependency readiness. Existing `/health` responses are not proof that Stripe, storage or GitHub are healthy. Inspect deployment checks before assigning readiness meaning. For lifecycle changes, stop accepting new work, allow bounded draining and close workers/connections deliberately. Current backend termination closes active connections immediately; do not describe it as verified production request draining.

## Delivery and validation

Use existing CI gates, locked dependencies and migration checks. Review migration compatibility with the application versions that may overlap during deployment; avoid destructive schema changes without an explicit migration/rollback plan. Do not assume rolling back an image reverses a migration. Pin deployed release images where the release process supports it and verify staging acceptance before calling a deployment successful.

Follow `.pi/AGENTS.md`: owner-managed servers, no live shell probes, no CI-owned builds locally and no unsolicited releases. Local typechecks/tests establish only their tested scope. Builds, live provider callbacks, backup restoration, operational readiness and performance need their own evidence; never infer them from a clean lint run.
