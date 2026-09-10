"use client";

import { ChipShell, Dropdown, MenuItem, MinWidthChip, SectionLabel } from "./chrome";
import { ChevronIcon, KpiIcon, ProjectIcon } from "./icons";
import {
  type BindingDraft,
  type Kpi,
  type Project,
  type TeamMember,
  type UserRef,
} from "@/lib/api";
import { cn } from "@/lib/cn";
// The three task chips: project, assignee and KPI. Each is a `Dropdown` trigger
// plus a menu, and each is used by BOTH the create modal and the detail drawer —
// which is why they live here rather than inside either one.
//
// They are presentational: every list they offer arrives as a PROP. The member
// list comes from `containerMembersAtom` in ./board-model, which the page-level
// fetch writes once and the modal and the drawer each read — one atom, two
// readers, so the two surfaces can never offer different members.
//
// Owner rule (2026-09-05): KPI binding is personal. `KpiChip` only offers the
// signed-in user's own KPIs, but a teammate's already-frozen binding stays
// visible.

export function ProjectChip({
  projects,
  value,
  onChange,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const current = projects.find((p) => p.id === value);
  // Archived projects are picked nowhere; they're managed on the team page.
  const live = projects.filter((p) => !p.archived);
  const team = live.filter((p) => p.scope === "team");
  const personal = live.filter((p) => p.scope === "personal");
  return (
    <Dropdown
      trigger={(open) => (
        <ChipShell open={open}>
          <MinWidthChip icon={<ProjectIcon />} longestLabel="Project">
            <span>{current?.name ?? "Project"}</span>
          </MinWidthChip>
          <ChevronIcon />
        </ChipShell>
      )}
    >
      <MenuItem selected={!value} onClick={() => onChange(null)}>
        No project
      </MenuItem>
      {team.length > 0 && <SectionLabel>Team</SectionLabel>}
      {team.map((p) => (
        <MenuItem key={p.id} selected={p.id === value} onClick={() => onChange(p.id)}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: p.color ?? "var(--color-ink-faint)" }}
            />
            {p.name}
          </span>
        </MenuItem>
      ))}
      {personal.length > 0 && <SectionLabel>Personal</SectionLabel>}
      {personal.map((p) => (
        <MenuItem key={p.id} selected={p.id === value} onClick={() => onChange(p.id)}>
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: p.color ?? "var(--color-ink-faint)" }}
            />
            {p.name} · {p.owner_username}
          </span>
        </MenuItem>
      ))}
      {projects.length === 0 && (
        <p className="m-0 px-3 py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
          No projects yet — create them on the team page.
        </p>
      )}
    </Dropdown>
  );
}

// PRD-10: assignee picker — any container member, clearable to Unassigned.
// The creator (owner) is shown as a chip inside the menu and the leader gets
// an owner pill; selection follows the checkmark-only drawer convention.
export function AssigneeChip({
  members,
  creator,
  value,
  currentUserId,
  onChange,
}: {
  members: TeamMember[];
  creator: UserRef | null;
  value: UserRef | null;
  currentUserId: string | null;
  onChange: (assigneeId: string | null) => void;
}) {
  const current = members.find((m) => m.user_id === value?.id);
  const label = current
    ? current.display_name || current.username
    : value
      ? value.display_name || value.username
      : "Unassigned";
  return (
    <Dropdown
      trigger={(open) => (
        <ChipShell open={open}>
          <MinWidthChip
            icon={
              current || value ? (
                <span className="grid size-4 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-[0.55rem] font-bold text-white">
                  {(
                    current?.display_name ||
                    current?.username ||
                    value?.display_name ||
                    value?.username ||
                    "?"
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )
            }
            longestLabel="Unassigned"
          >
            <span className="truncate">{label}</span>
          </MinWidthChip>
          <ChevronIcon />
        </ChipShell>
      )}
    >
      <MenuItem selected={!value} onClick={() => onChange(null)}>
        Unassigned
      </MenuItem>
      {members.map((m) => (
        <MenuItem
          key={m.user_id}
          selected={m.user_id === value?.id}
          onClick={() => onChange(m.user_id)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="grid size-4 flex-none place-items-center rounded-full bg-[var(--color-accent)] text-[0.55rem] font-bold text-white">
              {(m.display_name || m.username).slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{m.display_name || m.username}</span>
            {m.user_id === currentUserId && (
              <span className="text-[var(--color-ink-faint)]">· you</span>
            )}
            {m.role === "owner" && <span className="text-[var(--color-ink-faint)]">· owner</span>}
          </span>
        </MenuItem>
      ))}
      {creator && !members.some((m) => m.user_id === creator.id) && (
        <p className="m-0 px-3 py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
          Created by {creator.display_name || creator.username}
        </p>
      )}
    </Dropdown>
  );
}

export function KpiChip({
  kpis,
  value,
  onChange,
}: {
  kpis: Kpi[];
  value: BindingDraft[];
  onChange: (next: BindingDraft[]) => void;
}) {
  const total = value.reduce((s, b) => s + b.weight, 0);
  return (
    <Dropdown
      trigger={(open) => (
        <ChipShell open={open}>
          <MinWidthChip icon={<KpiIcon />} longestLabel="KPIs 100%">
            <span>{value.length > 0 ? `KPIs ${total}%` : "KPIs"}</span>
          </MinWidthChip>
          <ChevronIcon />
        </ChipShell>
      )}
    >
      {kpis.length === 0 && (
        <p className="m-0 px-3 py-2 text-[0.78rem] text-[var(--color-ink-faint)]">
          None of your KPIs here yet — create one on the team page.
        </p>
      )}
      {kpis.map((k) => {
        const binding = value.find((b) => b.kpi_id === k.id);
        return (
          <div key={k.id} className="flex items-center gap-2 px-3 py-[0.3rem]">
            <button
              type="button"
              onClick={() =>
                binding
                  ? onChange(value.filter((b) => b.kpi_id !== k.id))
                  : onChange([...value, { kpi_id: k.id, weight: 25 }])
              }
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-[0.82rem] text-[var(--color-ink)]"
            >
              <span
                className={cn(
                  "grid size-[14px] shrink-0 place-items-center rounded-[3px] border-[1.5px] text-transparent",
                  binding
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-border-strong)]"
                )}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="currentColor"
                    strokeWidth="3.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="truncate">
                {k.name}
                <span className="text-[var(--color-ink-faint)]"> · {k.owner_username}</span>
              </span>
            </button>
            {binding && (
              <input
                key={`${k.id}:${binding.weight}`}
                type="number"
                min={1}
                max={100}
                defaultValue={binding.weight}
                onBlur={(e) => {
                  const w = Math.min(100, Math.max(1, Number(e.target.value) || 1));
                  onChange(value.map((b) => (b.kpi_id === k.id ? { ...b, weight: w } : b)));
                }}
                aria-label={`Weight for ${k.name}`}
                className="w-14 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-1.5 py-0.5 text-right font-mono text-[0.76rem] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              />
            )}
          </div>
        );
      })}
      {value.length > 0 && (
        <div
          className={cn(
            "border-t border-[var(--color-border-soft)] px-3 py-1.5 text-[0.72rem]",
            total > 100
              ? "font-semibold text-[var(--color-danger)]"
              : "text-[var(--color-ink-faint)]"
          )}
        >
          {total}% of 100%{total > 100 ? " — over budget" : ""}
        </div>
      )}
    </Dropdown>
  );
}
