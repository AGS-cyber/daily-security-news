/**
 * The archive index, arranged as month grids.
 *
 * The archive is a list of dates in the record and a calendar on the page:
 * this module is the whole of that translation, and it is pure so both the
 * page and its test can hold the grid in their hands. `html.ts` knows how a
 * month looks; only this file knows which day of the week a date lands on.
 *
 * Two rules the grids keep, because both are ways of not lying about what was
 * published:
 *
 * - **Only months that have an edition appear.** A month with nothing in it is
 *   not drawn as an empty grid, so the calendar never implies a gap it cannot
 *   prove one way or the other.
 * - **Every day of a drawn month appears**, edition or not. A missed day is a
 *   visible hole in the grid rather than a row that silently is not there.
 */

/** One row of `site/editions/index.json`, and one linked day of the calendar. */
export type ArchiveEntry = {
  date: string;
  count: number;
} & ({ mode: 'digest' } | { mode: 'article'; headline: string });

/** One day of a drawn month. `entry` is null on a day that published nothing. */
export interface CalendarDay {
  date: string;
  day: number;
  entry: ArchiveEntry | null;
}

/** Seven cells, Monday first. `null` pads before the 1st and after the last. */
export type CalendarWeek = (CalendarDay | null)[];

export interface CalendarMonth {
  year: number;
  /** 1–12, not a `Date` month index. */
  month: number;
  weeks: CalendarWeek[];
  /** Days in this month that carry an edition. */
  count: number;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : MONTH_LENGTHS[month - 1]!;
}

/** 0 = Monday … 6 = Sunday. ISO order, and the dates are UTC throughout. */
function mondayIndex(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * Groups [entries] into month grids, newest month first.
 *
 * Throws on anything it cannot place: a malformed date, a day that does not
 * exist in its month, two editions claiming one day. The archive is built from
 * the editions on disk, so a date that cannot be laid out is a broken record,
 * and a broken record must stop the build rather than quietly lose a day.
 */
export function calendarMonths(entries: ArchiveEntry[]): CalendarMonth[] {
  const months = new Map<string, Map<number, ArchiveEntry>>();

  for (const entry of entries) {
    const parts = DATE.exec(entry.date);
    if (!parts) {
      throw new Error(`archive entry has a malformed date: ${JSON.stringify(entry.date)}`);
    }
    const year = Number(parts[1]);
    const month = Number(parts[2]);
    const day = Number(parts[3]);
    // `Date.UTC` maps years 0–99 onto 1900–1999; a four-digit year that is
    // still under 1000 would be laid out on the wrong weekday rather than
    // rejected, which is exactly the silent wrongness to refuse.
    if (year < 1000) throw new Error(`archive entry has an implausible year: ${entry.date}`);
    if (month < 1 || month > 12) throw new Error(`archive entry has no such month: ${entry.date}`);
    if (day < 1 || day > daysInMonth(year, month)) {
      throw new Error(`archive entry has no such day: ${entry.date}`);
    }

    const key = `${parts[1]}-${parts[2]}`;
    let days = months.get(key);
    if (!days) {
      days = new Map();
      months.set(key, days);
    }
    if (days.has(day)) throw new Error(`two editions claim ${entry.date}`);
    days.set(day, entry);
  }

  return [...months.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, days]) => monthGrid(key, days));
}

function monthGrid(key: string, days: Map<number, ArchiveEntry>): CalendarMonth {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));

  const cells: (CalendarDay | null)[] = new Array(mondayIndex(year, month, 1)).fill(null);
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    cells.push({
      date: `${key}-${String(day).padStart(2, '0')}`,
      day,
      entry: days.get(day) ?? null,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return { year, month, weeks, count: days.size };
}
