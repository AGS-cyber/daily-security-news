/**
 * The newsletter, as configured at Buttondown. Public values, not credentials
 * — the embed URL is meant to be in the page source, and the API key that
 * actually sends is a repository secret read from the environment
 * (`src/email.ts`).
 *
 * Buttondown holds the subscriber list on purpose (design.md §12): it owns
 * double opt-in, unsubscribe links, bounce and complaint handling, and
 * data-subject requests, none of which this repository is equipped to hold.
 */

/**
 * The Buttondown account name. It appears in the subscribe URL below, so this
 * must match the username on the account whose API key is in
 * `BUTTONDOWN_API_KEY` — a mismatch subscribes people to someone else's
 * newsletter and is not detectable from here.
 *
 * **Upper case, and that is not cosmetic.** Buttondown canonicalises the name:
 * `buttondown.com/ags` 302-redirects to `buttondown.com/AGS`. A redirect on a
 * GET is harmless, but clients answer a 302 on a *POST* by re-issuing it as a
 * GET with no body — so the non-canonical spelling would drop the address and
 * land the reader on the archive page looking subscribed. Use the form the
 * service redirects *to*.
 */
export const BUTTONDOWN_USERNAME = 'AGS';

/**
 * The keyless embed endpoint. It takes an ordinary form POST, which is what
 * lets the site subscribe readers with no JavaScript and no backend, and the
 * app subscribe them with no API key in the binary.
 */
export const SUBSCRIBE_URL = `https://buttondown.com/api/emails/embed-subscribe/${BUTTONDOWN_USERNAME}`;

/** Where the published edition lives, for the email's "read on the web" link. */
export const SITE_URL = 'https://daily-security-news.vercel.app';
