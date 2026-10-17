import { z } from "zod";
import { prisma } from "../db.ts";
import { env } from "../env.ts";
import { decryptSupport, supportConfigured } from "./support.ts";
import { log } from "./logger.ts";

// Durable, bounded retries; the provider idempotency key survives replica races.
// Retry window stays below Resend's 24h idempotency retention. Exhausted jobs
// stay visible to operators rather than being reported as delivered.
export async function drainSupportEmails(signal?: AbortSignal) {
  if (!supportConfigured()) return;
  await prisma.supportEmail.updateMany({
    where: {
      sentAt: null,
      attempts: { lt: 12 },
      createdAt: { lt: new Date(Date.now() - 23 * 3600_000) },
    },
    data: { attempts: 12 },
  });
  const jobs = await prisma.supportEmail.findMany({
    where: {
      sentAt: null,
      attempts: { lt: 12 },
      nextAttemptAt: { lte: new Date() },
      createdAt: { gte: new Date(Date.now() - 23 * 3600_000) },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: 10,
  });
  for (const job of jobs) {
    if (signal?.aborted) return;
    const claimed = await prisma.supportEmail.updateMany({
      where: {
        id: job.id,
        sentAt: null,
        attempts: job.attempts,
        nextAttemptAt: { lte: new Date() },
      },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: new Date(Date.now() + Math.min(3600_000, 60_000 * 2 ** job.attempts)),
      },
    });
    if (!claimed.count) continue;
    // If a workspace/ticket was removed, its queued email must not be delivered.
    if (
      !(await prisma.supportTicket.findUnique({
        where: { id: job.ticketId },
        select: { id: true },
      }))
    ) {
      await prisma.supportEmail.deleteMany({ where: { id: job.id } });
      continue;
    }
    try {
      const response = await fetch(env.SUPPORT_EMAIL_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPPORT_EMAIL_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `mokara-support-${job.id}`,
        },
        body: JSON.stringify({
          from: job.sender ?? env.SUPPORT_EMAIL_FROM,
          to: [job.recipient],
          subject: job.subject,
          text: decryptSupport(job.textEncrypted),
        }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      });
      if (
        !response.ok ||
        !z.object({ id: z.string().min(1) }).safeParse(await response.json()).success
      )
        throw new Error("Email provider unavailable");
      await prisma.supportEmail.update({
        where: { id: job.id },
        data: { sentAt: new Date(), textEncrypted: "" },
      });
    } catch {
      if (!signal?.aborted) log.warn(`Support email ${job.id} will retry`);
    }
  }
}
export function startSupportEmailWorker() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  let running = Promise.resolve();
  const tick = async () => {
    try {
      await drainSupportEmails(controller.signal);
    } catch {
      if (!stopped) log.warn("Support email delivery is temporarily unavailable");
    }
    if (!stopped) {
      timer = setTimeout(() => {
        running = tick();
      }, 15_000);
      timer.unref();
    }
  };
  if (supportConfigured()) running = tick();
  return async () => {
    stopped = true;
    controller.abort();
    if (timer) clearTimeout(timer);
    await running;
  };
}
