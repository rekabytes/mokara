import type { Release } from "@/lib/changelog";

export function ReleaseNotes({ releases }: { releases: Release[] }) {
  return (
    <div className="release-history">
      <p className="release-history-count">Release history · {releases.length} releases</p>
      {releases.map((release, index) => (
        <details className="release-entry" key={release.version} open={index === 0}>
          <summary className="release-entry-summary">
            <span className="release-entry-heading">
              <span className="release-meta">
                v{release.version} <span aria-hidden="true">·</span>{" "}
                <time dateTime={release.date}>
                  {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(
                    new Date(`${release.date}T00:00:00Z`)
                  )}
                </time>
                {index === 0 && <span className="release-latest">Latest</span>}
              </span>
              <span className="release-entry-title">{release.title}</span>
            </span>
            <svg
              className="release-entry-chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="release-entry-content">
            <p>{release.summary}</p>
            <ul>
              {release.changes.map((change) => (
                <li key={change.title}>
                  <h3>{change.title}</h3>
                  <p>{change.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}
    </div>
  );
}
