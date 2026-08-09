package dev.dailysecuritynews.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

/**
 * The subscribe state plus its two callbacks, passed as one value.
 *
 * It exists so [EditionScreen] takes a single `subscribe` parameter instead of
 * three that must be kept in step, and so `App` can hold one store whose typed
 * address survives navigating between editions.
 */
data class SubscribeSlot(
    val state: SubscribeState,
    val onSubmit: (String) -> Unit,
    val onReset: () -> Unit,
)

/**
 * The email sign-up, mirroring the site's `.subscribe` block — and mirroring
 * *where* the site puts it, which is the foot of every page rather than the
 * nav. It is not a destination of its own for that reason, and for one more:
 * a second app-bar action narrows the title slot enough to wrap the brand
 * lockup, which `docs/app.md` §11 rules out.
 *
 * The typed address is local state: it belongs to the field, not to the
 * network call, and nothing outside this block needs it.
 */
@Composable
fun SubscribeBlock(slot: SubscribeSlot) {
    var email by remember { mutableStateOf("") }
    val submitting = slot.state is SubscribeState.Submitting

    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // `.subscribe { border-top: 1px dashed var(--rule) }`.
        HorizontalDivider(color = Terminal.rule)

        Text(
            // `.subscribe h2::before { content: "## " }` — decoration drawn
            // here, never folded into the string it labels.
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = Terminal.dim)) { append("## ") }
                append("Get it by email")
            },
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 6.dp),
        )

        Text(
            text = "One edition a day, around 08:00 US Eastern. We send a confirmation " +
                "link first, and every email carries an unsubscribe link.",
            style = MaterialTheme.typography.bodySmall,
            color = Terminal.muted,
        )

        when (val state = slot.state) {
            is SubscribeState.Sent -> {
                Banner(
                    label = "[ NOTICE ]",
                    kind = BannerKind.Note,
                    // Not "you're subscribed": the list is double opt-in, and
                    // nobody is on it until they follow the link.
                    title = "Check your inbox",
                    lines = listOf(
                        "We've sent a confirmation link to $email. You'll start receiving " +
                            "the edition once you follow it.",
                    ),
                )
                TextButton(onClick = slot.onReset) { Text("Add another address") }
            }

            is SubscribeState.Failed -> {
                Banner(
                    label = "[ !! ERROR ]",
                    kind = BannerKind.Warn,
                    title = "Couldn't subscribe",
                    // Verbatim (docs/app.md §10): a reader who can see the real
                    // error can report it; a euphemism costs that.
                    lines = listOf(state.message),
                )
                SubscribeField(email, { email = it }, submitting, slot.onSubmit)
            }

            is SubscribeState.Idle, is SubscribeState.Submitting ->
                SubscribeField(email, { email = it }, submitting, slot.onSubmit)
        }
    }
}

@Composable
private fun SubscribeField(
    email: String,
    onChange: (String) -> Unit,
    submitting: Boolean,
    onSubmit: (String) -> Unit,
) {
    OutlinedTextField(
        value = email,
        onValueChange = onChange,
        modifier = Modifier.fillMaxWidth(),
        enabled = !submitting,
        singleLine = true,
        label = { Text("email") },
        placeholder = { Text("you@example.com") },
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Email,
            imeAction = ImeAction.Done,
        ),
        keyboardActions = KeyboardActions(onDone = { onSubmit(email) }),
    )

    Button(
        onClick = { onSubmit(email) },
        enabled = !submitting,
        modifier = Modifier.padding(top = 8.dp),
    ) {
        Text(if (submitting) "subscribing…" else "subscribe")
    }
}
