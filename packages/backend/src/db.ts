import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@mokara/db/prisma/generated/client";
import { env, isProd } from "./env.ts";
import { log } from "./lib/logger.ts";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    // Surface unexpected DB errors / warnings to the terminal. Quiet in prod
    // for normal flow but still loud on real problems.
    log: isProd ? ["error", "warn"] : ["error", "warn"],
  });

if (!isProd) {
  globalThis.__prisma = prisma;
}

// Pings the database and logs the result. Throws on failure so the caller
// can fail fast at startup.
export async function connectDB(): Promise<void> {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    log.ok("Connected to database");
  } catch (e) {
    log.error("Could not connect to database", e);
    throw e;
  }
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
}
