import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OPERATOR } from "@/lib/legal";

// Public document shell: the same header and footer as the landing page, a
// reading column, and one title template so every document is "X · Mokara".
// No AmbientCanvas here — these pages are read, and a WebGL context buys
// nothing at 3am while someone is deciding whether to trust us.

export const metadata: Metadata = {
  title: { default: "Legal", template: `%s · ${OPERATOR.productName}` },
  description:
    "The terms, privacy practices and cookie handling that govern Mokara, published under Malaysian and international data-protection law.",
};

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const hasSession = (await cookies()).has("mokara_token");

  return (
    <div className="flex min-h-dvh flex-col font-body">
      <SiteHeader
        authHref={hasSession ? "/tasks" : "/login"}
        authLabel={hasSession ? "Open app" : "Log in"}
      />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
