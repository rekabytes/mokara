"use client";

import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setSessionUser } from "@/lib/session";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { AuthLayout } from "@/components/AuthLayout";
import { SignupVerification, type SignupVerificationState } from "../SignupVerification";

export default function SocialSignupPage() {
  const router = useRouter();
  const { error, run, clearError } = useAsyncError();
  const [profile, setProfile] = useState<{ provider: string; email: string } | null>(null);
  const [verification, setVerification] = useState<SignupVerificationState>({ ready: false });
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const onVerificationChange = useCallback(
    (next: SignupVerificationState) => {
      setVerification(next);
      if (next.ready) clearError();
    },
    [clearError]
  );
  // Sync the temporary registration profile held by the backend's HttpOnly cookie.
  useEffect(() => {
    const controller = new AbortController();
    void run(() => api.pendingSocial(controller.signal), { signal: controller.signal }).then(
      (result) => {
        if (result) {
          setProfile(result);
        }
      }
    );
    return () => {
      controller.abort();
    };
  }, [run]);
  const canSubmit = Boolean(profile) && verification.ready && !loading;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    clearError();
    if (pending.current) return;
    pending.current = true;
    try {
      setLoading(true);
      const result = await run(() =>
        api.completeSocial({
          turnstile_token: verification.token,
        })
      );
      if (!result) {
        setVerification({ ready: false });
        setAttempt((value) => value + 1);
        return;
      }
      setSessionUser(result.user);
      router.replace(result.redirect);
      router.refresh();
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  return (
    <AuthLayout
      mode="signup"
      title="Welcome to Mokara"
      description="Complete verification to continue. Claim your username later in Settings."
    >
      {profile && (
        <p className="mb-5 break-words text-sm text-[var(--color-ink-muted)]">
          Verified with {profile.provider === "google" ? "Google" : "GitHub"}: {profile.email}
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {profile && <SignupVerification key={attempt} onChange={onVerificationChange} />}
        <ErrorBanner message={error?.message} />
        <button
          className="btn-base btn-primary min-h-12 w-full text-sm font-medium"
          disabled={!canSubmit}
        >
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
    </AuthLayout>
  );
}
