import Link from "next/link";
import { MCP_PERMISSIONS, type McpScope, type McpRepository } from "@/lib/mcp-permissions";
export function McpPermissions({
  scopes,
  onScopesChange,
  repositories,
  selectedRepositories,
  onRepositoriesChange,
  availableScopes,
  disabled = false,
}: {
  scopes: McpScope[];
  onScopesChange: (scopes: McpScope[]) => void;
  repositories: McpRepository[];
  selectedRepositories: string[];
  onRepositoriesChange: (ids: string[]) => void;
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
                  if (!next.includes("mokara:github")) onRepositoriesChange([]);
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
        <fieldset disabled={disabled} className="m-0 mt-4 min-w-0 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">Approved GitHub repositories</legend>
          <p className="mb-3 mt-0 text-xs leading-5 text-[var(--color-ink-muted)]">
            Choose at least one connected, enabled repository. This does not grant access to your
            other repositories.
          </p>
          <div className="grid max-h-56 gap-2 overflow-auto">
            {repositories.map((repo) => (
              <label key={repo.id} className="flex min-w-0 items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--color-accent)]"
                  checked={selectedRepositories.includes(repo.id)}
                  disabled={
                    !selectedRepositories.includes(repo.id) && selectedRepositories.length >= 20
                  }
                  onChange={(event) =>
                    onRepositoriesChange(
                      event.target.checked
                        ? [...selectedRepositories, repo.id]
                        : selectedRepositories.filter((id) => id !== repo.id)
                    )
                  }
                />
                <span className="break-words">
                  {repo.name}{" "}
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    · {repo.private ? "Private" : "Public"}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!repositories.length && (
            <p className="text-xs leading-5 text-[var(--color-ink-muted)]">
              Connect or refresh GitHub and enable repositories in{" "}
              <Link href="/settings" className="underline">
                Settings
              </Link>
              , then start a new connection request.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}
