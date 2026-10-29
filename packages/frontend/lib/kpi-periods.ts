// Presets operate on UTC calendar dates. Saved dates always require confirmation.
export function nextPeriodDates(endDate: string, months: 1 | 3) {
  const start = new Date(`${endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const year = start.getUTCFullYear(),
    month = start.getUTCMonth() + months,
    day = start.getUTCDate();
  const boundary = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  boundary.setUTCDate(Math.min(day, lastDay));
  boundary.setUTCDate(boundary.getUTCDate() - 1);
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: boundary.toISOString().slice(0, 10),
  };
}
