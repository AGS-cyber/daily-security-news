package dev.dailysecuritynews.app.ui

import dev.dailysecuritynews.app.data.EditionSummary
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The grid is the one part of the archive screen with arithmetic in it, and
 * every way it can be wrong — a month opening on the wrong column, a day lost
 * off the end of February — draws a calendar that still looks like a calendar.
 * So the shape is asserted here, and the weekdays are pinned to dates whose
 * day of the week is a matter of record rather than to the code's own answer.
 *
 * `src/render/calendar.ts` is the other half of this: the site and the app
 * draw the same grid from the same index, and nothing but these two test files
 * keeps them agreeing.
 */
class CalendarTest {

    private fun digest(date: String, count: Int = 3) =
        EditionSummary(date = date, mode = "digest", count = count)

    private fun article(date: String, headline: String = "A headline") =
        EditionSummary(date = date, mode = "article", count = 5, headline = headline)

    @Test
    fun weekdayIsPinnedToDatesOfRecord() {
        // Monday is 0. 1 January 1970 was a Thursday; 1 January 2000 and
        // 1 August 2026 Saturdays; 1 February 2024 a Thursday.
        assertEquals(3, mondayIndex(1970, 1, 1))
        assertEquals(5, mondayIndex(2000, 1, 1))
        assertEquals(3, mondayIndex(2024, 2, 1))
        assertEquals(5, mondayIndex(2026, 8, 1))
        // A leap day and the day after it, either side of the 29th.
        assertEquals(3, mondayIndex(2024, 2, 29))
        assertEquals(4, mondayIndex(2024, 3, 1))
    }

    @Test
    fun februaryKnowsAboutLeapYears() {
        assertEquals(29, daysInMonth(2024, 2))
        assertEquals(28, daysInMonth(2026, 2))
        assertEquals(29, daysInMonth(2000, 2))
        assertEquals(28, daysInMonth(1900, 2))
    }

    @Test
    fun monthStartsOnTheRightColumnAndRunsToItsLastDay() {
        val august = calendarMonths(listOf(digest("2026-08-06"))).single()

        assertEquals(2026, august.year)
        assertEquals(8, august.month)

        val first = august.weeks.first()
        assertEquals(7, first.size)
        assertEquals(List(5) { null }, first.take(5), "Monday to Friday are padding")
        assertEquals(1, first[5]?.day, "the 1st falls in the Saturday column")

        val days = august.weeks.flatten().filterNotNull()
        assertEquals(31, days.size)
        assertEquals("2026-08-31", days.last().date)
        assertTrue(august.weeks.all { it.size == 7 }, "every week is a full row")
    }

    @Test
    fun daysWithoutAnEditionAreStillDrawn() {
        val august = calendarMonths(
            listOf(article("2026-08-06", "A quiet week ends loudly")),
        ).single()
        val days = august.weeks.flatten().filterNotNull()

        assertEquals("article", days.single { it.date == "2026-08-06" }.entry?.mode)
        assertNull(
            days.single { it.date == "2026-08-07" }.entry,
            "a day that published nothing is drawn empty, not dropped",
        )
        assertEquals(1, august.count)
    }

    @Test
    fun monthsRunNewestFirstAndAnEmptyMonthIsNotDrawn() {
        val months = calendarMonths(
            listOf(digest("2026-08-18"), article("2026-08-06"), digest("2026-06-30")),
        )

        assertEquals(
            listOf("2026-8", "2026-6"),
            months.map { "${it.year}-${it.month}" },
            "July published nothing, so July is absent rather than empty",
        )
        assertEquals(2, months.first().count)
    }

    @Test
    fun anIndexThatCannotBeLaidOutThrows() {
        assertFailsWith<IllegalArgumentException> { calendarMonths(listOf(digest("06-08-2026"))) }
        assertFailsWith<IllegalArgumentException> { calendarMonths(listOf(digest("2026-02-30"))) }
        assertFailsWith<IllegalArgumentException> { calendarMonths(listOf(digest("2026-13-01"))) }
        assertFailsWith<IllegalArgumentException> { calendarMonths(listOf(digest("0026-08-06"))) }
        assertFailsWith<IllegalArgumentException> {
            calendarMonths(listOf(digest("2026-08-06"), article("2026-08-06")))
        }
    }

    @Test
    fun emptyArchiveIsAnEmptyCalendar() {
        assertEquals(emptyList(), calendarMonths(emptyList()))
    }

    @Test
    fun aDayIsReadAloudAsItsHeadline() {
        assertEquals(
            "2026-08-06 — A quiet week ends loudly · 5 stories",
            dayLabel("2026-08-06", article("2026-08-06", "A quiet week ends loudly")),
        )
        // A digest has no headline, and is named for what it is.
        assertEquals(
            "2026-08-13 — Automated digest · 1 story",
            dayLabel("2026-08-13", digest("2026-08-13", count = 1)),
        )
    }
}
