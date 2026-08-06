package dev.dailysecuritynews.app

import kotlin.test.Test
import kotlin.test.assertEquals

class AppTest {
    @Test
    fun scaffoldStringsAreWiredUp() {
        assertEquals("Daily Security News", APP_TITLE)
        assertEquals("scaffold — no data yet", SCAFFOLD_NOTICE)
    }
}
