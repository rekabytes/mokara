"use client";

import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAsyncError } from "@/hooks/useAsyncError";
import { setSessionUser, useSession } from "@/lib/session";
import { tileIn } from "@/lib/motion";
import { UsernameClaim } from "./UsernameClaim";
import { fmtMemberSince } from "./billing-copy";
import { Stat, TILE, TileHeader, UserIcon } from "./settings-chrome";

type Props = Pick<ReturnType<typeof useAsyncError>, "run" | "clearError"> & {
  deviceCount: number | null;
  containerCount: number;
};

export function ProfileTile({ run, clearError, deviceCount, containerCount }: Props) {
  const session = useSession();
  const user = session.status === "authed" ? session.user : null;
  // --- account: display name ---
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const profilePending = useRef(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const nameValue = nameDraft ?? user?.display_name ?? "";

  const onProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profilePending.current) return;
    profilePending.current = true;
    setProfileBusy(true);
    try {
      clearError();
      setProfileSaved(false);
      const trimmed = nameValue.trim();
      const updated = await run(
        () => api.updateMe({ display_name: trimmed.length > 0 ? trimmed : null }),
        {
          fallback: "Couldn't save your profile. Try again.",
        }
      );
      if (updated === null) return;
      setSessionUser(updated.user);
      setNameDraft(null);
      setProfileSaved(true);
    } finally {
      profilePending.current = false;
      setProfileBusy(false);
    }
  };

  return (
    <motion.section variants={tileIn} className={`${TILE} col-span-12 min-[961px]:col-span-7`}>
      <TileHeader
        icon={<UserIcon />}
        title="Profile"
        caption="How teammates see you across the workspace"
      />
      <div className="mt-4 flex items-center gap-4">
        <div className="grid size-14 flex-none place-items-center rounded-full bg-[linear-gradient(135deg,var(--color-progress),var(--color-accent))] text-[1.4rem] font-extrabold text-white shadow-[0_0_0_5px_var(--color-accent-soft)]">
          {(user?.display_name || user?.username || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="truncate text-[1.2rem] font-extrabold tracking-[-0.01em]">
              {user?.display_name || user?.username || ""}
            </b>
            <span className="flex-none rounded-[var(--radius-pill)] border border-[var(--color-border-soft)] bg-[rgba(148,163,184,0.1)] px-2 py-0.5 font-mono text-[0.76rem] text-[var(--color-ink-muted)]">
              @{user?.username ?? ""}
            </span>
          </div>
          <div className="mt-1 text-[0.8rem] text-[var(--color-ink-faint)]">
            {user ? `Member since ${fmtMemberSince(user.created_at)}` : ""}
          </div>
        </div>
      </div>
      <form onSubmit={onProfileSubmit} className="mt-4 flex flex-wrap items-end gap-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
            Display name
          </span>
          <input
            type="text"
            maxLength={50}
            placeholder="Shown next to your comments and activity"
            disabled={profileBusy}
            value={nameValue}
            onChange={(e) => setNameDraft(e.target.value)}
            className="field"
          />
        </label>
        <button
          type="submit"
          disabled={profileBusy || nameDraft === null}
          className="btn-base btn-ghost px-3.5 py-2 text-[0.85rem] disabled:cursor-default disabled:opacity-50"
        >
          {profileBusy ? "Saving…" : "Save"}
        </button>
      </form>
      {user && !user.username_claimed && <UsernameClaim temporaryUsername={user.username} />}
      {profileSaved && (
        <p role="status" className="mb-0 mt-2 text-[0.84rem] text-[var(--color-ink-muted)]">
          Profile saved.
        </p>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2.5 border-t border-[var(--color-border-soft)] pt-3.5">
        <Stat value={deviceCount ?? "—"} label="signed-in devices" />
        <Stat value="7d" label="session length" />
        <Stat value={containerCount || "—"} label="containers" />
      </div>
    </motion.section>
  );
}
