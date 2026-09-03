"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { setSessionUser } from "@/lib/session";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const { error, setError, run } = useAsyncError();
  const [loading, setLoading] = useState(false);

  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);
  const passwordValid = password.length >= 8;
  const canSubmit = usernameValid && passwordValid && !loading;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setLoading(true);
    const res = await run(
      () =>
        api.signUp({
          username: username.trim(),
          password,
          display_name: displayName.trim() || undefined,
        }),
      { fallback: "Sign up failed" }
    );
    setLoading(false);
    if (!res) return;
    setSessionUser(res.user);
    router.push("/tasks");
    router.refresh();
  }

  return (
    <main className="relative z-10 grid min-h-screen place-items-center px-5 py-8">
      <div className="card w-full max-w-[420px] px-7 pt-8 pb-7 text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-[0.8rem] py-[0.3rem] backdrop-blur-[22px]">
          <span className="block size-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_4px_var(--color-accent-soft)]" />
          <span className="text-[0.82rem] font-semibold tracking-[0.04em] text-[var(--color-ink-muted)]">
            MOKARA
          </span>
        </div>
        <h1 className="m-0 mb-[0.35rem] text-[1.5rem] font-bold tracking-[-0.02em]">
          Create your account
        </h1>
        <p className="m-0 mb-6 text-[0.92rem] text-[var(--color-ink-muted)]">
          Pick a username. It&apos;s how teammates will invite you.
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-[0.85rem] text-left">
          <label className="flex flex-col gap-[0.35rem]">
            <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
              Username
            </span>
            <input
              className="field"
              type="text"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="alice"
            />
            {username.length > 0 && !usernameValid && (
              <span className="text-[0.78rem] text-[var(--color-ink-faint)]">
                3-20 chars, lowercase letters, digits, underscore.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-[0.35rem]">
            <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
              Display name (optional)
            </span>
            <input
              className="field"
              type="text"
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alice Anderson"
            />
          </label>

          <label className="flex flex-col gap-[0.35rem]">
            <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
              Password
            </span>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            {password.length > 0 && !passwordValid && (
              <span className="text-[0.78rem] text-[var(--color-ink-faint)]">
                At least 8 characters.
              </span>
            )}
          </label>

          <ErrorBanner className="mb-4" message={error?.message} />

          <button type="submit" className="btn-base btn-primary mt-2 w-full" disabled={!canSubmit}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="m-0 mt-5 text-[0.88rem] text-[var(--color-ink-muted)]">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--color-accent)] no-underline hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
