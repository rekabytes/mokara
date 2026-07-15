"use client";

import { useMemo } from "react";

export const theme = {
  color: {
    surface: "rgba(255, 255, 255, 0.72)",
    surface2: "rgba(255, 255, 255, 0.55)",
    surfaceSolid: "#ffffff",
    border: "rgba(15, 23, 42, 0.07)",
    borderStrong: "rgba(15, 23, 42, 0.13)",
    text: "#0f172a",
    textMuted: "#64748b",
    textFaint: "#94a3b8",
    accent: "#6366f1",
    accentHover: "#5457e5",
    accentSoft: "rgba(99, 102, 241, 0.12)",
    danger: "#ef4444",
    dangerSoft: "rgba(239, 68, 68, 0.1)",
  },
  radius: {
    md: "18px",
    sm: "11px",
  },
  shadow: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.04)",
    md: "0 1px 3px rgba(15, 23, 42, 0.05), 0 10px 30px rgba(15, 23, 42, 0.06)",
    lg: "0 4px 12px rgba(15, 23, 42, 0.06), 0 24px 48px rgba(15, 23, 42, 0.1)",
  },
  blur: "saturate(180%) blur(22px)",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

export type Theme = typeof theme;

export function useTheme(): Theme {
  return useMemo(() => theme, []);
}
