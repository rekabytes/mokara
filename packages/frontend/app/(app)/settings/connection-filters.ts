import type { GitHubRepository, McpConnection } from "@/lib/api-types";
export type RepositoryFilter = "active" | "all" | "inactive" | "unavailable";
export type AgentFilter = "all" | "write" | "read";
export function repositoryStatus(repository: GitHubRepository): Exclude<RepositoryFilter, "all"> {
  return !repository.available ? "unavailable" : repository.enabled ? "active" : "inactive";
}
export function filterRepositories(
  repositories: GitHubRepository[],
  filter: RepositoryFilter,
  search: string
) {
  const query = search.trim().toLocaleLowerCase();
  return repositories
    .filter(
      (repository) =>
        (filter === "all" || repositoryStatus(repository) === filter) &&
        `${repository.full_name} ${repository.installation_account}`
          .toLocaleLowerCase()
          .includes(query)
    )
    .sort(
      (a, b) =>
        Number(repositoryStatus(b) === "active") - Number(repositoryStatus(a) === "active") ||
        a.full_name.localeCompare(b.full_name)
    );
}
export function filterAgentConnections(
  connections: McpConnection[],
  filter: AgentFilter,
  search: string,
  workspaceNames: ReadonlyMap<string, string>
) {
  const query = search.trim().toLocaleLowerCase();
  return connections.filter(
    (connection) =>
      (filter === "all" || connection.access === filter) &&
      [connection.name, ...connection.workspace_ids.map((id) => workspaceNames.get(id) ?? id)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
  );
}
