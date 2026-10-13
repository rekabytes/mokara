import "./globals.css";
// The landing type system is self-hosted (@fontsource) and declared once at the
// root so every public route — landing, legal documents — resolves the same
// faces. @font-face is lazy: nothing downloads unless a class asks for it.
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/fraunces/opsz-italic.css";
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/500.css";
import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/components/MotionProvider";
import { connection } from "next/server";
import { getRootMetadata } from "@/lib/seo.server";

export async function generateMetadata(): Promise<Metadata> {
  // Runtime deployment settings must not be frozen into a reusable Docker image.
  await connection();
  return getRootMetadata();
}

export const viewport: Viewport = {
  themeColor: "#f6f7fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
