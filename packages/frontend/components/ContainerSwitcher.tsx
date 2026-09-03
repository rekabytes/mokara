"use client";

import { useState } from "react";
import { useContainers } from "@/lib/containers";
import { cn } from "@/lib/cn";

// PRD-06: Linear-style container switcher. Lists every container the user
// belongs to (workspaces = private, teams = shared), selects the active one,
// and creates new ones via a modal that asks "individual or team".
// Selection lives in the Jotai container atoms, so every page follows along.

export function ContainerSwitcher() {
  const { containers, selected, setSelectedId, error, create } = useContainers();
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"workspace" | "team">("workspace");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const created = await create(trimmed, kind);
    setBusy(false);
    if (!created) return;
    setName("");
    setKind("workspace");
    setModalOpen(false);
  }

  return (
    <div className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Switch workspace or team"
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-[0.65rem] py-[0.5rem] text-left text-[0.88rem] font-semibold text-[var(--color-ink)]",
          "transition-colors duration-[160ms] hover:bg-[var(--color-surface-2)]"
        )}
      >
        <KindIcon kind={selected?.kind ?? "workspace"} />
        <span className="min-w-0 flex-1 truncate">
          {selected?.name ?? (error ? "Containers" : "Loading…")}
        </span>
        <ChevronIcon />
      </button>

      {error && <p className="mt-1.5 text-[0.72rem] text-[var(--color-danger)]">{error.message}</p>}

      {open && (
        <>
          {/* Backdrop closes the menu — no outside-click listener needed. */}
          <button
            type="button"
            aria-label="Close container menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[15] cursor-default border-0 bg-transparent p-0"
          />
          <div className="absolute left-0 right-0 z-[16] mt-1 overflow-hidden rounded-[12px] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] shadow-[var(--shadow-lift)]">
            <div className="max-h-[260px] overflow-y-auto py-1">
              {containers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(c.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-[0.65rem] py-[0.45rem] text-[0.84rem] text-[var(--color-ink)]",
                    "transition-colors duration-[120ms] hover:bg-[rgba(99,102,241,0.06)]",
                    selected?.id === c.id && "font-semibold"
                  )}
                >
                  <KindIcon kind={c.kind} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-[0.7rem] text-[var(--color-ink-faint)]">
                    {c.kind === "team" ? `${c.member_count} members` : "private"}
                  </span>
                </button>
              ))}
              {containers.length === 0 && !error && (
                <p className="px-[0.65rem] py-[0.45rem] text-[0.8rem] text-[var(--color-ink-faint)]">
                  No containers yet.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setModalOpen(true);
                setOpen(false);
              }}
              className="flex w-full cursor-pointer items-center gap-2 border-t border-[var(--color-border-soft)] px-[0.65rem] py-[0.5rem] text-[0.84rem] font-medium text-[var(--color-accent)] transition-colors duration-[120ms] hover:bg-[var(--color-surface-2)]"
            >
              <PlusIcon />
              New workspace / team
            </button>
          </div>
        </>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create a workspace or team"
          onKeyDown={(e) => {
            if (e.key === "Escape") setModalOpen(false);
          }}
          className="fixed inset-0 z-50 grid place-items-center px-4"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 cursor-default border-0 bg-[rgba(15,23,42,0.75)] backdrop-blur-[2px]"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="relative z-10 w-full max-w-[420px] rounded-[var(--radius-card)] border border-[var(--color-border-soft)] bg-[var(--color-surface-solid)] p-5 shadow-[var(--shadow-lift)]"
          >
            <h2 className="m-0 mb-1 text-[1rem] font-bold tracking-[-0.01em]">
              Create a container
            </h2>
            <p className="m-0 mb-4 text-[0.8rem] text-[var(--color-ink-muted)]">
              A <b>workspace</b> is private to you. A <b>team</b> is shared — you become its leader
              and can add team projects and KPIs right away.
            </p>
            <input
              autoFocus
              type="text"
              required
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="field mb-3 w-full"
            />
            <div className="mb-4 grid grid-cols-2 gap-2">
              <KindChoice
                active={kind === "workspace"}
                icon={<KindIcon kind="workspace" />}
                title="Individual"
                subtitle="Just me — private"
                onClick={() => setKind("workspace")}
              />
              <KindChoice
                active={kind === "team"}
                icon={<KindIcon kind="team" />}
                title="Team"
                subtitle="Shared with others"
                onClick={() => setKind("team")}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-base btn-ghost"
                style={{ padding: "0.45rem 0.85rem", fontSize: "0.82rem" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || busy}
                className="btn-base btn-primary"
                style={{ padding: "0.45rem 0.95rem", fontSize: "0.82rem" }}
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function KindChoice({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer flex-col items-start gap-0.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors duration-[120ms]",
        active
          ? "border-[var(--color-accent)] bg-[rgba(99,102,241,0.06)]"
          : "border-[var(--color-border-soft)] hover:bg-[var(--color-surface-2)]"
      )}
    >
      <span className="flex items-center gap-1.5 text-[0.84rem] font-semibold text-[var(--color-ink)]">
        {icon}
        {title}
      </span>
      <span className="text-[0.72rem] text-[var(--color-ink-faint)]">{subtitle}</span>
    </button>
  );
}

function KindIcon({ kind }: { kind: "workspace" | "team" }) {
  if (kind === "team") {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 text-[var(--color-accent)]"
      >
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
        <circle cx="16.5" cy="9" r="2.5" />
        <path d="M15.5 14.6c2.4.2 4.1 1.7 4.6 4" />
      </svg>
    );
  }
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-[var(--color-ink-faint)]"
    >
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-[var(--color-ink-faint)]"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
