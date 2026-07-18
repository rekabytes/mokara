"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, isApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login({ username: username.trim(), password });
      const from = search.get("from") || "/tasks";
      router.push(from);
      router.refresh();
    } catch (e: unknown) {
      if (isApiError(e)) {
        setError(e.message);
      } else {
        setError("Login failed");
      }
    } finally {
      setLoading(false);
    }
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
          Welcome back
        </h1>
        <p className="m-0 mb-6 text-[0.92rem] text-[var(--color-ink-muted)]">
          Sign in to your account.
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
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
            />
          </label>
          <label className="flex flex-col gap-[0.35rem]">
            <span className="text-[0.78rem] font-semibold tracking-[0.01em] text-[var(--color-ink-muted)]">
              Password
            </span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div className="mb-4 rounded-[var(--radius-btn)] border border-[var(--color-danger-border)] bg-[rgba(239,68,68,0.08)] px-4 py-[0.7rem] text-[0.88rem] text-[var(--color-danger-ink)]">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-base btn-primary mt-2 w-full"
            disabled={loading || !username.trim() || password.length < 8}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="m-0 mt-5 text-[0.88rem] text-[var(--color-ink-muted)]">
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-[var(--color-accent)] no-underline hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
