import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { OPERATOR } from "@/lib/legal";
import { AUTH_COOKIE } from "@/lib/cookies";

// Public pages share a calm palette, typography, navigation, and footer.
// Reading the session cookie keeps the app destination honest for signed-in visitors.

export const metadata: Metadata = {
  title: { default: "Pricing", template: `%s · ${OPERATOR.productName}` },
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const hasSession = (await cookies()).has(AUTH_COOKIE);

  return (
    <div className="public-site flex min-h-dvh flex-col font-body">
      <SiteHeader
        authHref={hasSession ? "/tasks" : "/login"}
        authLabel={hasSession ? "Open app" : "Log in"}
      />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
