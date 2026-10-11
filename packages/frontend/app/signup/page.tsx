"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setSessionUser } from "@/lib/session";
import { useAsyncError } from "@/hooks/useAsyncError";
import { ErrorBanner } from "@/components/ErrorBanner";
import { SocialSignIn } from "@/components/SocialSignIn";
import { AuthLayout } from "@/components/AuthLayout";
import { SignupVerification, type SignupVerificationState } from "./SignupVerification";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const { error, setError, run, clearError } = useAsyncError();
  const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState<SignupVerificationState>({ ready: false });
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const onVerificationChange = useCallback(
    (next: SignupVerificationState) => {
      setVerification(next);
      if (next.ready) clearError();
    },
    [clearError]
  );

  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);
  const passwordValid = password.length >= 8;
  const canSubmit = usernameValid && passwordValid && verification.ready && !loading;

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
          turnstile_token: verification.token,
        }),
      { fallback: "Sign up failed" }
    );
    setLoading(false);
    if (!res) {
      setVerification({ ready: false });
      setVerificationAttempt((value) => value + 1);
      return;
    }
    setSessionUser(res.user);
    router.push("/tasks");
    router.refresh();
  }

  return (
    <AuthLayout
      mode="signup"
      title="Create your account"
      description="Choose a username so teammates can find you."
    >
      <SocialSignIn appearance="auth" />
      <div className="my-6 flex items-center gap-3 text-xs text-[var(--color-ink-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border-strong)]" />
        or create with your username
        <span className="h-px flex-1 bg-[var(--color-border-strong)]" />
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--color-ink)]">Username</span>
          <input
            className="field min-h-12"
            type="text"
            autoComplete="username"
            required
            minLength={3}
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="alice"
          />
          {username.length > 0 && !usernameValid && (
            <span className="text-[0.78rem] text-[var(--color-ink-muted)]">
              3-20 chars, lowercase letters, digits, underscore.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--color-ink)]">
            Display name (optional)
          </span>
          <input
            className="field min-h-12"
            type="text"
            maxLength={50}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Alice Anderson"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--color-ink)]">Password</span>
          <input
            className="field min-h-12"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          {password.length > 0 && !passwordValid && (
            <span className="text-[0.78rem] text-[var(--color-ink-muted)]">
              At least 8 characters.
            </span>
          )}
        </label>

        <SignupVerification key={verificationAttempt} onChange={onVerificationChange} />
        <ErrorBanner message={error?.message} />

        <button
          type="submit"
          className="btn-base btn-primary mt-1 min-h-12 w-full text-sm font-medium"
          disabled={!canSubmit}
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}
