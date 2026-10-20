const OFFLINE_MESSAGE = 'You are offline. Check your connection and try again.'
const UNREACHABLE_MESSAGE = "We couldn't reach SET&PLATE. Check your connection and try again."
const NETWORK_FAILURE = /failed to fetch|load failed|network ?error|networkrequestfailed|timed out|timeout|connection (refused|reset|aborted)/i
const TECHNICAL_DETAIL = /failed to|\b(database|sql|table|supabase|postgrest|http|json|exception|traceback|undefined|null)\b|server error|status \d{3}/i

/**
 * Turns any thrown value into a short message that is safe and useful for the user.
 * Technical details never reach the screen: they fall back to the provided sentence.
 * @param {unknown} error
 * @param {string} fallback
 * @returns {string}
 */
export function describeError(error, fallback) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return OFFLINE_MESSAGE
  }

  const message = error instanceof Error ? error.message.trim() : ''
  if (!message) return fallback
  if (NETWORK_FAILURE.test(message)) return UNREACHABLE_MESSAGE
  if (TECHNICAL_DETAIL.test(message)) return fallback
  return message
}
