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
import { siteOrigin } from "@/lib/legal";

const origin = siteOrigin();

export const metadata: Metadata = {
  // Absolute base for og:image and og:url. Omitted when no origin is configured
  // rather than guessed — a relative og:image is simply not published then.
  ...(origin ? { metadataBase: new URL(origin) } : null),
  title: "Mokara",
  description: "Team tasks, calmly.",
};

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
