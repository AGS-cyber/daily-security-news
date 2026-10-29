import { escapeHtml } from './escape.js';

/** Date and time formatting shared by the page renderers. Always UTC. */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `YYYY-MM-DD` as "6 August 2026"; anything else is returned unchanged. */
export function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

/** A parseable timestamp as canonical UTC ISO, otherwise null. */
export function canonicalTime(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** "6 August 2026 12:00 UTC" for any parseable timestamp, in UTC throughout. */
export function formatDateTime(iso: string): string {
  const canonical = canonicalTime(iso);
  if (!canonical) return iso;
  return `${formatDate(canonical.slice(0, 10))} ${formatTime(canonical)}`;
}

/**
 * A `<time>` element. The date and the clock are both taken in UTC, so an
 * offset timestamp cannot show one day's date beside another day's time.
 * An unreadable value is shown verbatim (escaped) rather than guessed at.
 */
export function timestamp(iso: string): string {
  const canonical = canonicalTime(iso);
  if (!canonical) return escapeHtml(iso);
  return `<time datetime="${escapeHtml(canonical)}">${escapeHtml(formatDateTime(iso))}</time>`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const HOUR_MS = 60 * 60 * 1000;

/** "3 days" / "5 hours" between two instants; '' when either is unreadable. */
export function spanText(fromIso: string, toIso: string): string {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return '';
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 48) return plural(hours, 'hour', 'hours');
  return plural(Math.floor(hours / 24), 'day', 'days');
}
