"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setSessionUser } from "@/lib/session";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LegalLinksLine } from "@/components/LegalLinksLine";
import { SignupVerification, type SignupVerificationState } from "../SignupVerification";

export default function SocialSignupPage() {
  const router = useRouter();
  const { error, run, clearError } = useAsyncError();
  const [profile, setProfile] = useState<{ provider: string; email: string } | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [verification, setVerification] = useState<SignupVerificationState>({ ready: false });
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  // Sync the temporary registration profile held by the backend's HttpOnly cookie.
  useEffect(() => {
    let active = true;
    void run(() => api.pendingSocial()).then((result) => {
      if (active && result) {
        setProfile(result);
        setDisplayName(result.display_name);
      }
    });
    return () => {
      active = false;
    };
  }, [run]);
  const canSubmit =
    Boolean(profile) && /^[a-z0-9_]{3,20}$/.test(username) && verification.ready && !loading;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    clearError();
    setLoading(true);
    const result = await run(() =>
      api.completeSocial({
        username,
        display_name: displayName.trim() || undefined,
        turnstile_token: verification.token,
      })
    );
    setLoading(false);
    if (!result) {
      setVerification({ ready: false });
      setAttempt((value) => value + 1);
      return;
    }
    setSessionUser(result.user);
    router.replace(result.redirect);
    router.refresh();
  }
  return (
    <main className="relative z-10 grid min-h-screen place-items-center px-5 py-8">
      <div className="card w-full max-w-[420px] px-7 py-8">
        <p className="mb-5 text-xs font-semibold tracking-widest text-[var(--color-accent)]">
          MOKARA
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">One last step</h1>
        <p className="mb-5 text-sm text-[var(--color-ink-muted)]">
          Choose a username so teammates can invite you.
        </p>
        {profile && (
          <p className="mb-5 break-words text-sm text-[var(--color-ink-muted)]">
            Verified with {profile.provider === "google" ? "Google" : "GitHub"}: {profile.email}
          </p>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Username
            <input
              className="field"
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            />
            <span className="text-xs text-[var(--color-ink-muted)]">
              3–20 lowercase letters, digits or underscores.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Display name (optional)
            <input
              className="field"
              autoComplete="name"
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          {profile && <SignupVerification key={attempt} onChange={setVerification} />}
          <ErrorBanner message={error?.message} />
          <LegalLinksLine lead="By creating an account you agree to our" />
          <button className="btn-base btn-primary w-full" disabled={!canSubmit}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-5 text-sm text-[var(--color-ink-muted)]">
          Already use Mokara?{" "}
          <Link className="text-[var(--color-accent)] underline" href="/login">
            Sign in
          </Link>{" "}
          and connect this account from Settings.
        </p>
        <Link
          className="mt-3 inline-block text-sm text-[var(--color-accent)] underline"
          href="/signup"
        >
          Start again
        </Link>
      </div>
    </main>
  );
}
