import { Prisma } from "@mokara/db/prisma/generated/client";

export function numericGoalProgress(baseline: string, target: string, current: string | null) {
  if (current === null) return null;
  const start = new Prisma.Decimal(baseline),
    end = new Prisma.Decimal(target);
  if (start.eq(end)) return null;
  return Prisma.Decimal.max(
    0,
    Prisma.Decimal.min(
      100,
      new Prisma.Decimal(current).minus(start).div(end.minus(start)).times(100)
    )
  )
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
    .toNumber();
}
