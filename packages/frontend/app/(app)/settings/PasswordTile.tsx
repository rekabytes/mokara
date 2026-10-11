"use client";

import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { manualError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { tileIn } from "@/lib/motion";
import { LockIcon, TILE, TileHeader } from "./settings-chrome";

type Props = Pick<ReturnType<typeof useAsyncError>, "run" | "clearError" | "setError"> & {
  passwordLoginEnabled: boolean;
};

export function PasswordTile({ run, clearError, setError, passwordLoginEnabled }: Props) {
  // --- security: password ---
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordPending = useRef(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const onPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordPending.current) return;
    setPasswordSaved(false);
    if (newPassword !== confirmPassword) {
      setError(manualError("The new passwords don't match."));
      return;
    }
    clearError();
    passwordPending.current = true;
    setPasswordBusy(true);
    try {
      const ok = await run(
        () => api.changePassword({ current_password: currentPassword, new_password: newPassword }),
        { fallback: "Couldn't update the password. Try again." }
      );
      if (ok === null) return;
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      passwordPending.current = false;
      setPasswordBusy(false);
    }
  };

  return (
    <motion.section variants={tileIn} className={`${TILE} col-span-12 min-[961px]:col-span-5`}>
      <TileHeader
        icon={<LockIcon />}
        title="Password"
        caption="Changing it signs out every other device"
      />
      {passwordLoginEnabled ? (
        <form onSubmit={onPasswordSubmit} className="mt-4 flex flex-col gap-3 text-left">
          <label className="flex flex-col gap-1">
            <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
              Current password
            </span>
            <input
              disabled={passwordBusy}
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
              New password
            </span>
            <input
              disabled={passwordBusy}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.84rem] font-semibold text-[var(--color-ink-muted)]">
              Confirm new password
            </span>
            <input
              disabled={passwordBusy}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="field"
            />
          </label>
          {passwordSaved && (
            <p role="status" className="m-0 text-[0.84rem] text-[var(--color-ink-muted)]">
              Password updated — other devices were signed out.
            </p>
          )}
          <button
            disabled={passwordBusy}
            type="submit"
            className="btn-base btn-primary mt-1 w-full"
          >
            {passwordBusy ? "Updating…" : "Update password"}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          Your account uses Google or GitHub to sign in. There is no Mokara password to change.
        </p>
      )}
    </motion.section>
  );
}
