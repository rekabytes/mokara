import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AmbientCanvas } from "@/components/AmbientCanvas";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OPERATOR } from "@/lib/legal";
import { AUTH_COOKIE } from "@/lib/cookies";

// Public marketing shell: the landing page's furniture — ambient field, shared
// header, shared footer — around any marketing route, so a pricing page and the
// home page can never drift apart.
//
// The legal documents deliberately drop the WebGL field because those pages are
// read at 3am; marketing pages keep it because the field is part of how Mokara
// looks. Reading the session cookie keeps the header CTA honest for signed-in
// visitors, which makes these routes dynamic — the same deliberate trade the
// landing and the legal pages already make.

export const metadata: Metadata = {
  title: { default: "Pricing", template: `%s · ${OPERATOR.productName}` },
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const hasSession = (await cookies()).has(AUTH_COOKIE);

  return (
    <div className="flex min-h-dvh flex-col font-body">
      <AmbientCanvas />
      <SiteHeader
        authHref={hasSession ? "/tasks" : "/login"}
        authLabel={hasSession ? "Open app" : "Log in"}
      />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
