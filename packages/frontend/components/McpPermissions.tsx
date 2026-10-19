import Link from "next/link";
import { MCP_PERMISSIONS, type McpScope } from "@/lib/mcp-permissions";
export function McpPermissions({
  scopes,
  onScopesChange,
  availableScopes,
  disabled = false,
}: {
  scopes: McpScope[];
  onScopesChange: (scopes: McpScope[]) => void;
  availableScopes?: string[];
  disabled?: boolean;
}) {
  return (
    <div className="my-5 min-w-0">
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 text-sm font-medium">Agent permissions</legend>
        <div className="grid gap-2">
          {MCP_PERMISSIONS.filter(
            (permission) => !availableScopes || availableScopes.includes(permission.scope)
          ).map((permission) => (
            <label
              key={permission.scope}
              className="flex min-w-0 items-start gap-3 rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] px-4 py-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]"
                checked={scopes.includes(permission.scope)}
                disabled={permission.scope === "mokara:read"}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...scopes, permission.scope]
                    : scopes.filter((scope) => scope !== permission.scope);
                  onScopesChange(next);
                }}
              />
              <span className="min-w-0">
                <span className="block font-medium">{permission.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--color-ink-muted)]">
                  {permission.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {scopes.includes("mokara:github") && (
        <div className="mt-4 rounded-[var(--radius-btn)] border border-[var(--color-border-soft)] p-4 text-xs leading-5 text-[var(--color-ink-muted)]">
          <p className="m-0 font-medium text-[var(--color-ink)]">
            Follows your active repositories
          </p>
          <p className="mb-0 mt-2">
            This agent can access your active GitHub repositories, including repositories you
            activate later. Manage them in{" "}
            <Link href="/settings" className="underline">
              Settings → GitHub
            </Link>
            . Changes apply to the next agent request without reconnecting. Inactive repositories
            and repositories you can no longer access stay unavailable.
          </p>
        </div>
      )}
    </div>
  );
}
