import { Suspense } from "react";
import type { Metadata } from "next";
import { ConsentScreen } from "./ConsentScreen";
export const metadata: Metadata = {
  title: { absolute: "Connect an agent · Mokara" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConsentScreen />
    </Suspense>
  );
}
