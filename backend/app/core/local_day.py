"""The user's current day, sent by the browser so a day ends at local midnight instead of UTC."""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from fastapi import Query

MAX_DAY_LENGTH = timedelta(hours=25)  # a daylight saving change makes one day 25 hours long


@dataclass(frozen=True)
class LocalDay:
    local_date: date
    start: datetime
    end: datetime


def utc_day() -> LocalDay:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return LocalDay(start.date(), start, start + timedelta(days=1))


def local_day(
    today: date | None = Query(None, description="Local calendar date"),
    today_start: datetime | None = Query(None, description="Local day start instant (inclusive ISO 8601)"),
    today_end: datetime | None = Query(None, description="Local day end instant (exclusive ISO 8601)"),
) -> LocalDay:
    """Use the browser's day only if it contains the current time.

    A device with a wrong clock falls back to the UTC day, so it still gets a
    working Home and cannot read or change any day other than today.
    """
    if today is None or today_start is None or today_end is None:
        return utc_day()
    if today_start.tzinfo is None or today_end.tzinfo is None:
        return utc_day()
    now = datetime.now(timezone.utc)
    if not today_start <= now < today_end or today_end - today_start > MAX_DAY_LENGTH:
        return utc_day()
    if abs((today - now.date()).days) > 1:
        return utc_day()
    return LocalDay(today, today_start, today_end)
