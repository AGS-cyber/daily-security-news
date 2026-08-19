import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarMonths, daysInMonth, type ArchiveEntry } from './calendar.js';

/**
 * The grid is the one piece of the archive with arithmetic in it, and every
 * bug it can have — a month starting on the wrong column, a day dropped off
 * the end of February — renders as a plausible calendar rather than as an
 * error. So the shape is asserted here rather than eyeballed on the page.
 */

function digest(date: string, count = 3): ArchiveEntry {
  return { date, mode: 'digest', count };
}

function article(date: string, headline = 'A headline'): ArchiveEntry {
  return { date, mode: 'article', headline, count: 5 };
}

test('a month starts on the right weekday and runs to its last day', () => {
  // 1 August 2026 is a Saturday, and August has 31 days.
  const [august] = calendarMonths([digest('2026-08-06')]);
  assert.ok(august);
  assert.equal(august.year, 2026);
  assert.equal(august.month, 8);

  const first = august.weeks[0]!;
  assert.equal(first.length, 7);
  assert.deepEqual(
    first.slice(0, 5),
    [null, null, null, null, null],
    'Monday to Friday of the first week are padding',
  );
  assert.equal(first[5]?.day, 1, 'the 1st falls on the Saturday column');

  const days = august.weeks.flat().filter((cell) => cell !== null);
  assert.equal(days.length, 31);
  assert.equal(days.at(-1)?.date, '2026-08-31');
  // Every week is a full row; the trailing days are padded out.
  for (const week of august.weeks) assert.equal(week.length, 7);
});

test('only days with an edition carry one, and the rest are still drawn', () => {
  const [august] = calendarMonths([article('2026-08-06', 'A quiet week ends loudly')]);
  const cells = august!.weeks.flat().filter((cell) => cell !== null);

  const sixth = cells.find((cell) => cell.date === '2026-08-06');
  assert.equal(sixth?.entry?.mode, 'article');

  const seventh = cells.find((cell) => cell.date === '2026-08-07');
  assert.equal(seventh?.entry, null, 'a day that published nothing is drawn empty, not dropped');
  assert.equal(august!.count, 1);
});

test('months come back newest first, and a month with nothing in it is not drawn', () => {
  const months = calendarMonths([
    digest('2026-06-30'),
    article('2026-08-06'),
    digest('2026-08-18'),
  ]);

  assert.deepEqual(
    months.map((m) => `${m.year}-${m.month}`),
    ['2026-8', '2026-6'],
    'July published nothing, so July is absent rather than empty',
  );
  assert.equal(months[0]?.count, 2);
});

test('February knows about leap years', () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(1900, 2), 28);

  const [february] = calendarMonths([digest('2024-02-29')]);
  const days = february!.weeks.flat().filter((cell) => cell !== null);
  assert.equal(days.length, 29);
  // 1 February 2024 is a Thursday: three padding cells before it.
  assert.equal(february!.weeks[0]!.filter((cell) => cell === null).length, 3);
});

test('a date the calendar cannot place is fatal rather than skipped', () => {
  assert.throws(() => calendarMonths([digest('06-08-2026')]), /malformed date/);
  assert.throws(() => calendarMonths([digest('2026-02-30')]), /no such day/);
  assert.throws(() => calendarMonths([digest('2026-13-01')]), /no such month/);
  assert.throws(() => calendarMonths([digest('0026-08-06')]), /implausible year/);
  assert.throws(
    () => calendarMonths([digest('2026-08-06'), article('2026-08-06')]),
    /two editions claim 2026-08-06/,
  );
});

test('an empty archive is an empty calendar, not a throw', () => {
  assert.deepEqual(calendarMonths([]), []);
});
