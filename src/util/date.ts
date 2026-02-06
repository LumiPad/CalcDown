/**
 * Purpose: Parse and format ISO dates plus month arithmetic.
 * Intent: Keep date semantics UTC-stable for deterministic evaluation.
 */

export function parseIsoDate(value: string): Date {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return d;
}

export function formatIsoDate(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addMonthsUTC(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const targetMonth = m + months;
  const candidate = new Date(Date.UTC(y, targetMonth, 1));
  const endOfTargetMonth = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0));
  const clampedDay = Math.min(d, endOfTargetMonth.getUTCDate());
  return new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), clampedDay));
}

