"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setSessionUser } from "@/lib/session";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SocialSignIn } from "@/components/SocialSignIn";
import { AuthLayout } from "@/components/AuthLayout";

export default function LoginPage() {
  // useSearchParams() bails out of static rendering, and Next requires it to
  // sit under a Suspense boundary — without one, `next build` fails the export
  // of /login outright. The form itself is unchanged, just one level down.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { error, setError, run } = useAsyncError();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await run(() => api.login({ username: username.trim(), password }), {
      fallback: "Login failed",
    });
    setLoading(false);
    if (!res) return;
    setSessionUser(res.user);
    const from = search.get("from") || "/tasks";
    router.push(from);
    router.refresh();
  }

  return (
    <AuthLayout title="Welcome back" description="Sign in and pick up where you left off.">
      <SocialSignIn appearance="auth" />
      <div className="my-6 flex items-center gap-3 text-xs text-[var(--color-ink-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border-strong)]" />
        or sign in with your username
        <span className="h-px flex-1 bg-[var(--color-border-strong)]" />
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Username</span>
          <input
            className="field min-h-12"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Password</span>
          <input
            className="field min-h-12"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
        </label>
        <ErrorBanner message={error?.message} />
        <button
          type="submit"
          className="btn-base btn-primary mt-1 min-h-12 w-full justify-between text-sm font-medium"
          disabled={loading || !username.trim() || password.length < 8}
        >
          {loading ? "Signing in…" : "Sign in"}
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14m-5-5 5 5-5 5" />
          </svg>
        </button>
      </form>
    </AuthLayout>
  );
}
