// Date-only helpers with LOCAL-day semantics. TMDB air/release dates are plain
// YYYY-MM-DD strings; `new Date('YYYY-MM-DD')` parses them as UTC midnight, which
// shifts "today"/countdowns by up to a day depending on the user's timezone.
// Rule: compare Y-M-D strings against the LOCAL calendar day, and diff at local midnight.
const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export const localToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** An air date counts as aired on its local calendar day (or when unknown). */
export const isAired = (air: string | null | undefined): boolean => !air || air.slice(0, 10) <= localToday();

/** Whole days from today (local midnight) until a YYYY-MM-DD date. Min 1 (use isAired for "today or past"). */
export const daysUntil = (ymd: string): number => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const now = new Date();
  const target = new Date(y, (m || 1) - 1, d || 1).getTime();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(1, Math.round((target - today0) / 86400000));
};

/** Local HH:MM for an ISO timestamp ('' when missing/invalid). */
export const localHm = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Local YYYY-MM-DD for an ISO timestamp ('' when missing/invalid). */
export const localDay = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
