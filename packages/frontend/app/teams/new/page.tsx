"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, isApiError } from "@/lib/api";

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Team name is required");
      return;
    }
    if (trimmed.length > 50) {
      setError("Team name must be 50 chars or fewer");
      return;
    }
    setLoading(true);
    try {
      const { team } = await api.createTeam({ name: trimmed });
      router.push(`/teams/${team.id}`);
      router.refresh();
    } catch (e: unknown) {
      if (isApiError(e)) setError(e.message);
      else setError("Failed to create team");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <nav className="topbar">
        <Link href="/" className="brand">
          <span className="logo-dot" />
          <span className="brand-name">MOKARA</span>
        </Link>
      </nav>

      <header className="hero">
        <h1 className="title">Create a team</h1>
        <p className="subtitle">Invite up to 2 teammates by username.</p>
      </header>

      <form onSubmit={onSubmit} className="card auth-form">
        <label className="auth-field">
          <span className="auth-label">Team name</span>
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

        {error && <div className="alert">{error}</div>}

        <div className="auth-actions">
          <Link href="/" className="btn ghost">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn primary"
            disabled={loading || !name.trim()}
          >
            {loading ? "Creating…" : "Create team"}
          </button>
        </div>
      </form>
    </main>
  );
}