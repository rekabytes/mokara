"use client";

import { useState, useRef, type FormEvent } from "react";
import { api } from "@/lib/api";
import { setSessionUser } from "@/lib/session";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";

export function UsernameClaim({ temporaryUsername }: { temporaryUsername: string }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const { error, run, clearError } = useAsyncError();
  const valid = /^[a-z0-9_]{3,20}$/.test(username);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    if (pending.current) return;
    pending.current = true;
    try {
      clearError();
      setBusy(true);
      const result = await run(() => api.claimUsername(username));
      if (result) setSessionUser(result.user);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 border-t border-[var(--color-border-soft)] pt-4">
      <h3 className="m-0 text-sm font-semibold">Claim your username</h3>
      <p className="mb-3 mt-1 text-sm text-[var(--color-ink-muted)]">
        Choose how teammates find and invite you. Your temporary username is{" "}
        <span className="break-all">@{temporaryUsername}</span>. You can claim a username once.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          Username
          <input
            className="field"
            required
            autoComplete="username"
            minLength={3}
            maxLength={20}
            pattern="[a-z0-9_]{3,20}"
            value={username}
            onChange={(event) =>
              setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
          />
          <span className="text-xs text-[var(--color-ink-muted)]">
            3–20 lowercase letters, digits or underscores.
          </span>
        </label>
        <ErrorBanner message={error?.message} />
        <button className="btn-base btn-primary self-start" disabled={!valid || busy}>
          {busy ? "Claiming…" : "Claim username"}
        </button>
      </form>
    </div>
  );
}
