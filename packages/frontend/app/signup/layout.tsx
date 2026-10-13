import type { Metadata } from "next";
import { PRIVATE_ROBOTS } from "@/lib/seo.server";

export const metadata: Metadata = { title: "Create an account", robots: PRIVATE_ROBOTS };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
