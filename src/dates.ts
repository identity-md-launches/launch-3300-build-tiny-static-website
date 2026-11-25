/**
 * Dates and times as the visitor reads them. A moment (a block time, a job's completion, a read time with a clock)
 * is shown in the visitor's own time zone, its date and its time from the same clock. A plain calendar date
 * ("2026-11-19", a Launched fact) has no time zone and is shown as written. Pure, for tests.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** A time in seconds or milliseconds, as milliseconds. */
const toMs = (t: number) => (t < 1e11 ? t * 1000 : t);

/** "25 Nov 2026" for a moment, in the visitor's time zone. */
export function localDate(t: number): string {
  const d = new Date(toMs(t));
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "25 Nov 2026, 22:49" for a moment: date and time both in the visitor's time zone. */
export function localDateTime(t: number): string {
  const d = new Date(toMs(t));
  return `${localDate(t)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "2026-11-19" becomes "19 Nov 2026" as written; a moment ("2026-11-19T23:12:00Z", or a time in seconds or
 * milliseconds) becomes its date in the visitor's time zone. A value that is not a date is returned as given.
 */
export function readDate(v: string): string {
  const t = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) {
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return `${Number(m[3])} ${MONTHS[mo - 1]} ${m[1]}`;
  }
  const ms = /^\d{10,13}$/.test(t) ? Number(t) * (t.length === 10 ? 1000 : 1) : Date.parse(t);
  if (!t || Number.isNaN(ms)) return t;
  return localDate(ms);
}
