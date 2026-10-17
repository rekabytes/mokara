import { z } from "zod";

/** Configuration owns the mailbox; a website name can never supply an address. */
export function supportSenderMailbox(configured: string): string {
  if (/[\p{Cc}\p{Cf}]/u.test(configured)) throw new Error("Invalid support sender configuration");
  const match = /^(?:[^<>]*<([^<>]+)>|([^<>]+))$/.exec(configured.trim());
  const mailbox = (match?.[1] ?? match?.[2] ?? "").trim();
  if (!z.email().max(254).safeParse(mailbox).success)
    throw new Error("Invalid support sender configuration");
  return mailbox;
}

export function brandedSupportSender(websiteName: string, configured: string): string {
  const name = websiteName
    .replace(/[\p{Cc}\p{Cf}<>]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  const support = !name ? "Support" : /\bsupport$/i.test(name) ? name : `${name} Support`;
  const label = `${support} via Mokara`.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${label}" <${supportSenderMailbox(configured)}>`;
}
