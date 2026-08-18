// Tiny human-readable logger. No timestamps, no JSON dumps — just lines like:
//   ✓ Connected to database
//   � AUTH_SECRET not set
//   ✗ database connection failed (followed by stack trace)

function fmt(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export const log = {
  info(msg: string) {
    console.log(msg);
  },
  ok(msg: string) {
    console.log(`✓ ${msg}`);
  },
  warn(msg: string) {
    console.warn(`⚠ ${msg}`);
  },
  error(msg: string, err?: unknown) {
    console.error(`✗ ${msg}`);
    if (err instanceof Error) console.error(err.stack);
    else if (err !== undefined) console.error(err);
  },
  duration: fmt,
};
