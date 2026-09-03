"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { manualError } from "@/lib/errors";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { useContainers } from "@/lib/containers";

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const { error, setError, run } = useAsyncError();
  const { load: reloadContainers, setSelectedId } = useContainers();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(manualError("Team name is required"));
      return;
    }
    if (trimmed.length > 50) {
      setError(manualError("Team name must be 50 chars or fewer"));
      return;
    }
    setLoading(true);
    const res = await run(() => api.createTeam({ name: trimmed, kind: "team" }), {
      fallback: "Failed to create team",
    });
    setLoading(false);
    if (!res) return;
    // Keep the switcher atoms in sync, then land on the new container.
    setSelectedId(res.team.id);
    await reloadContainers();
    router.push(`/teams/${res.team.id}`);
  }

  return (
    <div className="flex flex-col gap-9">
      <header className="mt-2 flex flex-col gap-2">
        <h1 className="m-0 text-[clamp(1.6rem,4vw,2.1rem)] font-bold leading-[1.15] tracking-[-0.025em]">
          Create a team
        </h1>
        <p className="m-0 text-[0.98rem] text-[var(--color-ink-muted)]">
          Invite up to 2 teammates by username.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="card flex max-w-[480px] flex-col gap-[0.85rem] p-7 text-left"
      >
        <label className="flex flex-col gap-[0.35rem]">
          <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
            Team name
          </span>
          <input
            className="field"
            type="text"
            autoFocus
            required
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme"
          />
        </label>

        <ErrorBanner className="mb-4" message={error?.message} />

        <div className="mt-2 flex justify-end gap-2">
          <Link href="/tasks" className="btn-base btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn-base btn-primary" disabled={loading || !name.trim()}>
            {loading ? "Creating…" : "Create team"}
          </button>
        </div>
      </form>
    </div>
  );
}
