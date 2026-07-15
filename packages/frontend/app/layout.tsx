import "./globals.css";
import type { Metadata, Viewport } from "next";
import AuroraBackground from "@/components/AuroraBackground";

export const metadata: Metadata = {
  title: "Mokara — Tasks",
  description: "A minimal task management app",
};

export const viewport: Viewport = {
  themeColor: "#f6f7fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuroraBackground />
        {children}
      </body>
    </html>
  );
}
