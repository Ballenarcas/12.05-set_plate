"""Daily limit on the paid AI calls a user can trigger directly."""

from datetime import date, datetime, timezone
from threading import Lock
from uuid import UUID

from fastapi import HTTPException, status

MAX_AI_CALLS_PER_DAY = 30

# shortcut: counts live in this process, so a restart resets them and each worker keeps its own.
# Move them to the database before raising WEB_CONCURRENCY above 1.
_calls: dict[str, tuple[date, int]] = {}
_lock = Lock()


def use_ai_call(user_id: UUID) -> None:
    """Count one AI call, or raise 429 when the user has none left today."""
    key = str(user_id)
    today = datetime.now(timezone.utc).date()
    with _lock:
        day, count = _calls.get(key, (today, 0))
        count = count if day == today else 0
        if count >= MAX_AI_CALLS_PER_DAY:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="You've reached today's AI limit. Please try again tomorrow.",
            )
        _calls[key] = (today, count + 1)
