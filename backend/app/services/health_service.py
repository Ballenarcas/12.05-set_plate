"""Health Connect consent and daily activity persistence.

The browser cannot call Health Connect directly. The Android host injects
``window.SETPLATEHealthConnect``, the frontend syncs the returned days here, and
the AI trainer reads the stored aggregates instead of trusting query strings.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.db.supabase_client import get_supabase
from app.schemas.health import (
    HealthActivityDay,
    HealthActivitySummary,
    HealthActivitySyncRequest,
    HealthConnectRequest,
    HealthConnectSource,
    HealthConnectStatus,
    HealthScopes,
)

logger = logging.getLogger(__name__)

HEALTH_CONNECTIONS_TABLE = "health_connections"
HEALTH_ACTIVITY_TABLE = "health_activity"
WINDOW_DAYS = 7
SYNC_LOOKBACK_DAYS = 30
STORAGE_ERROR = "Health Connect is not set up on the server yet."


def _rows(response: Any) -> list[dict[str, Any]]:
    rows = response.data or []
    return rows if isinstance(rows, list) else [rows]


def _int(value: Any, maximum: int) -> int:
    try:
        parsed = int(float(value or 0))
    except (TypeError, ValueError):
        return 0
    return max(0, min(parsed, maximum))


def _today(value: Any = None) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value:
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            pass
    return datetime.now(timezone.utc).date()


def _as_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _source(value: Any) -> HealthConnectSource:
    try:
        return HealthConnectSource(str(value))
    except ValueError:
        return HealthConnectSource.HEALTH_CONNECT


def _is_missing_table(error: Exception) -> bool:
    text = str(error)
    return "PGRST205" in text or "does not exist" in text or "schema cache" in text


def _storage_error(error: Exception) -> RuntimeError:
    return RuntimeError(STORAGE_ERROR)


def _connection_row(session: Any, user_id: UUID) -> dict[str, Any]:
    rows = _rows(
        session.table(HEALTH_CONNECTIONS_TABLE).select("*")
        .eq("user_id", str(user_id)).limit(1).execute()
    )
    return rows[0] if rows else {}


def _activity_rows(session: Any, user_id: UUID, start: date, end: date) -> list[dict[str, Any]]:
    return _rows(
        session.table(HEALTH_ACTIVITY_TABLE)
        .select("activity_date,steps,active_calories")
        .eq("user_id", str(user_id))
        .gte("activity_date", start.isoformat())
        .lte("activity_date", end.isoformat())
        .order("activity_date")
        .execute()
    )


def _activity_days(rows: list[dict[str, Any]]) -> list[HealthActivityDay]:
    by_date: dict[date, HealthActivityDay] = {}
    for row in rows:
        day = _as_date(row.get("activity_date"))
        if day is None:
            continue
        by_date[day] = HealthActivityDay(
            date=day,
            steps=_int(row.get("steps"), 100_000),
            active_calories=_int(row.get("active_calories"), 5_000),
        )
    return [by_date[day] for day in sorted(by_date)]


def _summarize(
    days: list[HealthActivityDay],
    source: HealthConnectSource,
    today: date,
) -> HealthActivitySummary:
    if not days:
        return HealthActivitySummary(connected=True, source=source)
    window = days[-WINDOW_DAYS:]
    steps_avg = round(sum(day.steps for day in window) / len(window))
    calories_avg = round(sum(day.active_calories for day in window) / len(window))
    by_date = {day.date: day for day in days}
    today_row = by_date.get(today) or by_date.get(today + timedelta(days=1))
    return HealthActivitySummary(
        connected=True,
        source=source,
        steps_today=today_row.steps if today_row else 0,
        active_calories_today=today_row.active_calories if today_row else 0,
        steps_avg_7d=max(0, steps_avg),
        active_calories_avg_7d=max(0, calories_avg),
    )


def _status(
    row: dict[str, Any],
    days: list[HealthActivityDay],
    today: date,
) -> HealthConnectStatus:
    connected = bool(row.get("connected"))
    source = _source(row.get("source"))
    scopes = HealthScopes()
    if isinstance(row.get("scopes"), dict):
        try:
            scopes = HealthScopes(**row["scopes"])
        except ValueError:
            pass
    return HealthConnectStatus(
        connected=connected,
        provider=str(row.get("provider") or "health_connect"),
        source=source,
        connected_at=row.get("connected_at"),
        last_sync_at=row.get("last_sync_at"),
        scopes=scopes,
        activity=_summarize(days, source, today) if connected else HealthActivitySummary(),
        days=days[-WINDOW_DAYS:],
    )


def get_activity_summary(
    user_id: UUID,
    db_session: Any = None,
    today: Any = None,
) -> HealthActivitySummary:
    """Return the stored snapshot, or a disconnected summary when tables/data are absent.

    Callers are suggestion paths (dashboard, calorie rules, workout planning), so a
    missing optional table must not take the whole suggestion down.
    """
    day = _today(today)
    try:
        session = db_session or get_supabase(admin=True)
        if session is None:
            return HealthActivitySummary()
        row = _connection_row(session, user_id)
        if not row or not row.get("connected"):
            return HealthActivitySummary()
        rows = _activity_rows(
            session, user_id, day - timedelta(days=WINDOW_DAYS - 1), day + timedelta(days=1),
        )
        return _summarize(_activity_days(rows), _source(row.get("source")), day)
    except KeyError:
        return HealthActivitySummary()
    except Exception as error:
        if not _is_missing_table(error):
            logger.warning("Could not read Health Connect activity: %s", error, exc_info=True)
        return HealthActivitySummary()


def get_status(user_id: UUID, db_session: Any = None) -> HealthConnectStatus:
    session = db_session or get_supabase(admin=True)
    if session is None:
        raise RuntimeError("Supabase is not configured")
    try:
        row = _connection_row(session, user_id)
    except Exception as error:
        if _is_missing_table(error):
            raise _storage_error(error) from error
        raise
    if not row or not row.get("connected"):
        return _status(row, [], _today())
    day = _today()
    try:
        rows = _activity_rows(
            session, user_id, day - timedelta(days=WINDOW_DAYS - 1), day + timedelta(days=1),
        )
    except Exception as error:
        if _is_missing_table(error):
            raise _storage_error(error) from error
        raise
    return _status(row, _activity_days(rows), day)


def _save_days(
    session: Any,
    user_id: UUID,
    days: list[HealthActivityDay],
    source: HealthConnectSource,
    synced_at: datetime,
) -> None:
    by_date = {day.date: day for day in days}
    rows = [
        {
            "user_id": str(user_id),
            "activity_date": day.date.isoformat(),
            "steps": day.steps,
            "active_calories": day.active_calories,
            "source": source.value,
            "synced_at": synced_at.isoformat(),
        }
        for day in by_date.values()
    ]
    if rows:
        session.table(HEALTH_ACTIVITY_TABLE).upsert(
            rows, on_conflict="user_id,activity_date",
        ).execute()


def _recent_days(days: list[HealthActivityDay]) -> list[HealthActivityDay]:
    today = _today()
    earliest = today - timedelta(days=SYNC_LOOKBACK_DAYS)
    latest = today + timedelta(days=1)
    return [day for day in days if earliest <= day.date <= latest]


def connect(
    user_id: UUID,
    payload: HealthConnectRequest,
    db_session: Any = None,
) -> HealthConnectStatus:
    session = db_session or get_supabase(admin=True)
    if session is None:
        raise RuntimeError("Supabase is not configured")
    now = datetime.now(timezone.utc)
    recent_days = _recent_days(payload.days)
    connection = {
        "user_id": str(user_id),
        "provider": "health_connect",
        "connected": True,
        "source": payload.source.value,
        "scopes": payload.scopes.model_dump(),
        "connected_at": now.isoformat(),
        "disconnected_at": None,
        "last_sync_at": now.isoformat() if recent_days else None,
        "updated_at": now.isoformat(),
    }
    try:
        session.table(HEALTH_CONNECTIONS_TABLE).upsert(
            connection, on_conflict="user_id",
        ).execute()
        if recent_days:
            _save_days(session, user_id, recent_days, payload.source, now)
    except Exception as error:
        if _is_missing_table(error):
            raise _storage_error(error) from error
        raise
    return get_status(user_id, session)


def sync_activity(
    user_id: UUID,
    payload: HealthActivitySyncRequest,
    db_session: Any = None,
) -> HealthConnectStatus:
    session = db_session or get_supabase(admin=True)
    if session is None:
        raise RuntimeError("Supabase is not configured")
    try:
        row = _connection_row(session, user_id)
        if not row or not row.get("connected"):
            raise ValueError("Connect Health Connect before syncing activity.")
        days = _recent_days(payload.days)
        if not days:
            raise ValueError("No recent activity days to sync.")
        now = datetime.now(timezone.utc)
        _save_days(session, user_id, days, payload.source, now)
        session.table(HEALTH_CONNECTIONS_TABLE).update({
            "source": payload.source.value,
            "last_sync_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }).eq("user_id", str(user_id)).execute()
    except ValueError:
        raise
    except Exception as error:
        if _is_missing_table(error):
            raise _storage_error(error) from error
        raise
    return get_status(user_id, session)


def disconnect(user_id: UUID, db_session: Any = None) -> HealthConnectStatus:
    session = db_session or get_supabase(admin=True)
    if session is None:
        raise RuntimeError("Supabase is not configured")
    now = datetime.now(timezone.utc)
    connection = {
        "user_id": str(user_id),
        "provider": "health_connect",
        "connected": False,
        "source": "health_connect",
        "scopes": HealthScopes().model_dump(),
        "disconnected_at": now.isoformat(),
        "last_sync_at": None,
        "updated_at": now.isoformat(),
    }
    try:
        session.table(HEALTH_CONNECTIONS_TABLE).upsert(
            connection, on_conflict="user_id",
        ).execute()
        session.table(HEALTH_ACTIVITY_TABLE).delete().eq("user_id", str(user_id)).execute()
    except Exception as error:
        if _is_missing_table(error):
            raise _storage_error(error) from error
        raise
    return get_status(user_id, session)
