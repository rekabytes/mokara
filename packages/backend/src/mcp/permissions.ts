export const MCP_SCOPES = [
  "mokara:read",
  "mokara:write",
  "mokara:delete",
  "mokara:github",
  "mokara:drive:read",
  "mokara:drive:upload",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
export function validScopes(scopes: string[]) {
  return (
    scopes.length > 0 &&
    scopes.includes("mokara:read") &&
    new Set(scopes).size === scopes.length &&
    scopes.every((scope) => MCP_SCOPES.some((allowed) => allowed === scope))
  );
}
export function parseScopes(raw: string) {
  return raw.split(" ").filter(Boolean);
}
