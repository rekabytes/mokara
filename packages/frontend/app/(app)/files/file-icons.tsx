export function FileIcon({
  kind = "file",
}: {
  kind?: "file" | "folder" | "upload" | "image" | "trash";
}) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "folder" ? (
        <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z" />
      ) : kind === "upload" ? (
        <path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" />
      ) : kind === "trash" ? (
        <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
      ) : kind === "image" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 17 5-5 4 4 4-6 5 7" />
        </>
      ) : (
        <>
          <path d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6m-6 4h6" />
        </>
      )}
    </svg>
  );
}
