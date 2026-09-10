"use client";

import { useAsyncError } from "@/hooks/useAsyncError";
import { api, type Team } from "@/lib/api";
import { useRef, useState } from "react";
// The workspace logo card: current logo (or its absence), the upload picker and
// the remove button. Leader-only — `canManage` decides whether the controls
// render, matching the PUT/DELETE routes.
//
// This is the one component in the split that owns its own API calls
// (`useAsyncError` + `api.setTeamLogo` / `api.removeTeamLogo`) rather than
// taking handlers as props, because the upload needs a local `busy` flag and a
// file-input ref that nothing else shares. `onTeam` hands the refreshed
// container back to the page so the switcher and the header update together.
// The logo image is served `no-cache` by the route, which is why a plain `<img>`
// (not `next/image`) is correct here — one of the five pre-existing
// `no-img-element` lint warnings.

// PRD-11 Phase 1.4: the container's identity tile — its logo, plus the leader's
// controls to set or clear it. Shown to every member (who can see a container
// can see what it looks like); the buttons are leader-only, and the routes
// enforce that again.
export function LogoCard({
  team,
  canManage,
  onTeam,
}: {
  team: Team;
  canManage: boolean;
  onTeam: (team: Team) => void;
}) {
  const { error, run } = useAsyncError();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    const res = await run(() => api.setTeamLogo(team.id, file), {
      fallback: "Failed to set the logo",
    });
    setBusy(false);
    if (!res) return;
    onTeam(res.team);
  }

  async function remove() {
    setBusy(true);
    const res = await run(() => api.removeTeamLogo(team.id), {
      fallback: "Failed to remove the logo",
    });
    setBusy(false);
    if (!res) return;
    onTeam(res.team);
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        {team.has_logo ? (
          <img
            src={api.teamLogoUrl(team.id)}
            alt=""
            className="size-10 shrink-0 rounded-[10px] object-cover"
          />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-accent-soft)] text-[0.95rem] font-bold text-[var(--color-accent)]">
            {team.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-[0.95rem] font-bold tracking-[-0.01em]">{team.name}</h2>
          <p className="m-0 text-[0.72rem] text-[var(--color-ink-faint)]">
            {team.kind === "team" ? "Team" : "Private workspace"}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-full border border-[var(--color-border-soft)] px-2.5 py-1 text-[0.72rem] font-medium text-[var(--color-ink-muted)] transition-colors duration-[120ms] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
            >
              {team.has_logo ? "Change" : "Logo"}
            </button>
            {team.has_logo && (
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="cursor-pointer rounded-full border border-transparent px-2 py-1 text-[0.72rem] font-medium text-[var(--color-ink-faint)] transition-colors duration-[120ms] hover:text-[var(--color-danger)] disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="m-0 mt-2 text-[0.72rem] text-[var(--color-danger)]">{error.message}</p>
      )}
    </div>
  );
}
