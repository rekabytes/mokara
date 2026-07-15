"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, isApiError } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);
  const passwordValid = password.length >= 8;
  const canSubmit = usernameValid && passwordValid && !loading;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setLoading(true);
    try {
      await api.signUp({
        username: username.trim(),
        password,
        display_name: displayName.trim() || undefined,
      });
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      if (isApiError(e)) {
        if (e.error === "username_taken") {
          setError("That username is already taken.");
        } else if (e.error === "invalid_username") {
          setError("Username must be 3-20 chars of a-z, 0-9, or underscore.");
        } else if (e.error === "weak_password") {
          setError("Password must be at least 8 characters.");
        } else {
          setError(e.message);
        }
      } else {
        setError("Sign up failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card card">
        <div className="brand">
          <span className="logo-dot" />
          <span className="brand-name">MOKARA</span>
        </div>
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">
          Pick a username. It&apos;s how teammates will invite you.
        </p>

        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">Username</span>
            <input
              className="field"
              type="text"
              autoComplete="username"
              autoFocus
              required
              minLength={3}
              maxLength={20}
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
              }
              placeholder="alice"
            />
            {username.length > 0 && !usernameValid && (
              <span className="auth-hint">
                3-20 chars, lowercase letters, digits, underscore.
              </span>
            )}
          </label>

          <label className="auth-field">
            <span className="auth-label">Display name (optional)</span>
            <input
              className="field"
              type="text"
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alice Anderson"
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
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
              <span className="auth-hint">At least 8 characters.</span>
            )}
          </label>

          {error && <div className="alert">{error}</div>}

          <button type="submit" className="btn primary auth-submit" disabled={!canSubmit}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="auth-foot">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}