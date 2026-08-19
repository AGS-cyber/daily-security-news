package dev.dailysecuritynews.app.ui

import dev.dailysecuritynews.app.data.EditionSummary

/**
 * `/editions/index.json` arranged as month grids — the Kotlin mirror of
 * `src/render/calendar.ts`, drawing the same calendar the site draws.
 *
 * **A hand-maintained mirror with no compiler tie to the TypeScript**, the same
 * drift risk `docs/app.md` §4 describes for the models and §11 for the palette.
 * The rules the two share, and the reason for each:
 *
 * - **Monday first**, because the dates are UTC and the publication is a
 *   technical one.
 * - **Only months holding an edition are drawn**, so the calendar never implies
 *   a gap it cannot prove.
 * - **Every day of a drawn month is drawn**, edition or not: a day nothing was
 *   published on should look like a hole, not be quietly absent.
 *
 * Pure, and deliberately not a composable: the arithmetic is the part that can
 * be wrong in a way that still renders as a plausible calendar, so it is
 * testable without a screen.
 */

/** One day of a drawn month. [entry] is null on a day that published nothing. */
data class CalendarDay(
    val date: String,
    val day: Int,
    val entry: EditionSummary?,
)

/** Seven cells, Monday first; `null` pads before the 1st and after the last. */
data class CalendarMonth(
    val year: Int,
    /** 1–12. */
    val month: Int,
    val weeks: List<List<CalendarDay?>>,
    /** Days in this month that carry an edition. */
    val count: Int,
)

private val DATE = Regex("""^(\d{4})-(\d{2})-(\d{2})$""")
private val MONTH_LENGTHS = intArrayOf(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

internal val MONTH_NAMES = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

private fun isLeapYear(year: Int): Boolean =
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0

internal fun daysInMonth(year: Int, month: Int): Int =
    if (month == 2 && isLeapYear(year)) 29 else MONTH_LENGTHS[month - 1]

/**
 * 0 = Monday … 6 = Sunday.
 *
 * Hand-rolled rather than reached for from a date library: `kotlinx-datetime`
 * is not a dependency of this module, and one calendar arithmetic function
 * across three targets is a smaller thing to own than a new multiplatform
 * artifact to resolve on all of them — the trap `docs/app.md` §10 records for
 * `navigationevent-compose`. It is Howard Hinnant's days-from-civil, and
 * `CalendarTest` pins it to dates whose weekday is a matter of record.
 */
internal fun mondayIndex(year: Int, month: Int, day: Int): Int {
    val y = if (month <= 2) year - 1 else year
    val era = (if (y >= 0) y else y - 399) / 400
    val yearOfEra = y - era * 400
    val dayOfYear = (153 * (if (month > 2) month - 3 else month + 9) + 2) / 5 + day - 1
    val dayOfEra = yearOfEra * 365L + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
    // Days since 1970-01-01, which was a Thursday — index 3 with Monday at 0.
    val days = era * 146_097L + dayOfEra - 719_468L
    return (((days + 3) % 7 + 7) % 7).toInt()
}

/**
 * Groups [entries] into month grids, newest month first.
 *
 * Throws [IllegalArgumentException] on an index it cannot lay out — a
 * malformed date, a day its month does not have, two editions on one day.
 * A date the calendar cannot place is a broken contract, and `CLAUDE.md`'s
 * fail-loud rule puts a visible error above a screen quietly missing a day.
 * `EditionsStore` turns the throw into the archive's error state, which shows
 * the message verbatim and offers Retry.
 */
fun calendarMonths(entries: List<EditionSummary>): List<CalendarMonth> {
    val months = linkedMapOf<String, MutableMap<Int, EditionSummary>>()

    for (entry in entries) {
        val parts = DATE.matchEntire(entry.date)
        requireNotNull(parts) { "The edition index has a malformed date: ${entry.date}" }
        val (yearText, monthText, dayText) = parts.destructured
        val year = yearText.toInt()
        val month = monthText.toInt()
        val day = dayText.toInt()

        require(year >= 1000) { "The edition index has an implausible year: ${entry.date}" }
        require(month in 1..12) { "The edition index has no such month: ${entry.date}" }
        require(day in 1..daysInMonth(year, month)) {
            "The edition index has no such day: ${entry.date}"
        }

        val days = months.getOrPut("$yearText-$monthText") { mutableMapOf() }
        require(!days.containsKey(day)) { "Two editions claim ${entry.date}" }
        days[day] = entry
    }

    return months.entries
        .sortedByDescending { it.key }
        .map { (key, days) -> monthGrid(key, days) }
}

private fun monthGrid(key: String, days: Map<Int, EditionSummary>): CalendarMonth {
    val year = key.take(4).toInt()
    val month = key.substring(5, 7).toInt()

    val cells = MutableList<CalendarDay?>(mondayIndex(year, month, 1)) { null }
    for (day in 1..daysInMonth(year, month)) {
        cells += CalendarDay(
            date = "$key-${day.toString().padStart(2, '0')}",
            day = day,
            entry = days[day],
        )
    }
    while (cells.size % 7 != 0) cells += null

    return CalendarMonth(
        year = year,
        month = month,
        weeks = cells.chunked(7),
        count = days.size,
    )
}
