"use client";

import { FatalError } from "@/components/FatalError";

/** Last resort when the root layout itself fails. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <FatalError error={error} reset={reset} />
      </body>
    </html>
  );
}
