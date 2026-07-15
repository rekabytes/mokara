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
      const from = search.get("from") || "/";
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
    <main className="auth-shell">
      <div className="auth-card card">
        <div className="brand">
          <span className="logo-dot" />
          <span className="brand-name">MOKARA</span>
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to your account.</p>

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
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">Password</span>
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

          {error && <div className="alert">{error}</div>}

          <button
            type="submit"
            className="btn primary auth-submit"
            disabled={loading || !username.trim() || password.length < 8}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="auth-foot">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </main>
  );
}