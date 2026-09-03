import "./globals.css";
import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/components/MotionProvider";

export const metadata: Metadata = {
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
