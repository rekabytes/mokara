import type { Metadata } from "next";
import { PRIVATE_ROBOTS } from "@/lib/seo.server";
import "./mobile.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = { robots: PRIVATE_ROBOTS };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
