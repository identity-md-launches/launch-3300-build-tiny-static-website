/** Source read times as a date, such as "19 Nov 2026". Pure, for tests. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-19T08:12:00Z" or "2026-11-19" becomes "19 Nov 2026"; a value that is not a date is returned as given. */
export function readDate(v: string): string {
  const t = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) {
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return `${Number(m[3])} ${MONTHS[mo - 1]} ${m[1]}`;
  }
  const ms = /^\d{10,13}$/.test(t) ? Number(t) * (t.length === 10 ? 1000 : 1) : Date.parse(t);
  if (!t || Number.isNaN(ms)) return t;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
