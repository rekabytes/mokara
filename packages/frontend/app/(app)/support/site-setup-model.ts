import type { SupportSite, SupportSiteDraft } from "@/lib/support-types";

export const DEFAULT_SUPPORT_ACCENT = "#6366f1";
export const DEFAULT_SUPPORT_GREETING = "Report an issue or send a request.";
export const SUPPORT_ACCENT_PRESETS = [
  { name: "Mokara indigo", value: DEFAULT_SUPPORT_ACCENT },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#15803d" },
  { name: "Slate", value: "#475569" },
] as const;
export const SUPPORT_TEXT_PRESETS = [
  { name: "White", value: "#ffffff" },
  { name: "Dark slate", value: "#0f172a" },
  { name: "Black", value: "#000000" },
] as const;
export type SupportEditorDraft = Omit<SupportSiteDraft, "origins" | "button_text_color"> & {
  originsText: string;
  buttonTextColor: string | null;
};
export function initialSupportDraft(site: SupportSite | null): SupportEditorDraft {
  return {
    name: site?.name ?? "",
    originsText: site?.origins.join("\n") ?? "",
    accent: (site?.accent ?? DEFAULT_SUPPORT_ACCENT).toUpperCase(),
    greeting: site?.greeting ?? DEFAULT_SUPPORT_GREETING,
    enabled: site?.enabled ?? true,
    buttonTextColor: site?.button_text_color?.toUpperCase() ?? null,
  };
}
export function supportHex(value: string): string | null {
  return /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}
export function supportOriginHint(text: string): string | null {
  const line = text.split(/\n/).find((value) => value.trim());
  if (!line) return null;
  try {
    const url = new URL(line.trim());
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
export function supportSitePayload(draft: SupportEditorDraft, accent: string): SupportSiteDraft {
  return {
    name: draft.name.trim(),
    origins: draft.originsText
      .split(/\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    accent,
    button_text_color: draft.buttonTextColor === null ? null : supportHex(draft.buttonTextColor),
    greeting: draft.greeting.trim(),
    enabled: draft.enabled,
  };
}
