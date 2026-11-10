"""Limit on password reset emails per address, so the form can't be used to flood an inbox."""

import time
from threading import Lock

MIN_SECONDS_BETWEEN_EMAILS = 120
MAX_EMAILS_PER_DAY = 5

# shortcut: counts live in this process, so a restart resets them and each worker keeps its own.
# Move them to the database before raising WEB_CONCURRENCY above 1.
_sent: dict[str, list[float]] = {}
_lock = Lock()


def allow_reset_email(email: str, now: float | None = None) -> bool:
    """Record one email to this address, or return False when it is over the limit."""
    now = time.time() if now is None else now
    with _lock:
        recent = [sent for sent in _sent.get(email, []) if now - sent < 86_400]
        if len(recent) >= MAX_EMAILS_PER_DAY or (recent and now - recent[-1] < MIN_SECONDS_BETWEEN_EMAILS):
            _sent[email] = recent
            return False
        _sent[email] = [*recent, now]
        return True
