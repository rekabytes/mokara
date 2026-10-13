// Native clients omit Origin. Browser access is an explicit, exact allow-list;
// neither a wildcard nor Origin: null grants access.
export function isAllowedMcpOrigin(origin: string | undefined, configured: string) {
  return (
    origin === undefined ||
    (origin !== "null" &&
      configured
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value !== "*")
        .includes(origin))
  );
}
