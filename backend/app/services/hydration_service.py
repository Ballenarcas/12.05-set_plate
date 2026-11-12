"""Daily hydration: one row per drink, summed into today's total per user."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.core.local_day import LocalDay
from app.db.supabase_client import get_supabase
from app.schemas.hydration import HydrationEntry, HydrationLogCreate, HydrationToday

GLASS_ML = 250
DEFAULT_GOAL_ML = 2500
ML_PER_KG = 35  # common wellness heuristic, not a medical recommendation
MIN_GOAL_ML = 1500
MAX_GOAL_ML = 4000


class HydrationStorageUnavailable(RuntimeError):
    """Supabase is unreachable, so today's drinks cannot be read or saved."""


def _session() -> Any:
    session = get_supabase(admin=True)
    if session is None:
        raise HydrationStorageUnavailable("Database connection unavailable")
    return session


def daily_goal_ml(weight: Any) -> int:
    """A weight-based daily goal (35 ml per kg), clamped to a sane range."""
    try:
        kg = float(weight)
    except (TypeError, ValueError):
        return DEFAULT_GOAL_ML
    if kg <= 0:
        return DEFAULT_GOAL_ML
    goal = round(kg * ML_PER_KG / 50) * 50  # nearest 50 ml keeps the goal readable
    return int(min(MAX_GOAL_ML, max(MIN_GOAL_ML, goal)))


def _user_weight(user_id: UUID) -> Any:
    rows = (
        _session()
        .table("users")
        .select("weight")
        .eq("id", str(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0].get("weight") if rows else None


def _day_rows(user_id: UUID, day: LocalDay) -> list[dict[str, Any]]:
    return (
        _session()
        .table("hydration_logs")
        .select("id,amount_ml,source,created_at")
        .eq("user_id", str(user_id))
        .eq("log_date", day.local_date.isoformat())
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def _summary(user_id: UUID, day: LocalDay, rows: list[dict[str, Any]] | None = None) -> HydrationToday:
    if rows is None:
        rows = _day_rows(user_id, day)
    total = sum(int(row.get("amount_ml") or 0) for row in rows)
    goal = daily_goal_ml(_user_weight(user_id))
    entries = [
        HydrationEntry(
            id=str(row.get("id")),
            amount_ml=int(row.get("amount_ml") or 0),
            unit=row.get("source") or "ml",
            created_at=row.get("created_at"),
        )
        for row in rows
    ]
    return HydrationToday(
        total_ml=total,
        goal_ml=goal,
        progress_percentage=min(100, round((total / goal) * 100)) if goal > 0 else 0,
        remaining_ml=max(0, goal - total),
        entries=entries,
    )


def get_today(user_id: UUID, day: LocalDay) -> HydrationToday:
    return _summary(user_id, day)


def add_entry(user_id: UUID, day: LocalDay, payload: HydrationLogCreate) -> HydrationToday:
    amount_ml = payload.amount * GLASS_ML if payload.unit == "glass" else payload.amount
    record = {
        "user_id": str(user_id),
        "log_date": day.local_date.isoformat(),
        "amount_ml": amount_ml,
        "source": payload.unit,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _session().table("hydration_logs").insert(record).execute()
    return _summary(user_id, day)


def delete_entry(user_id: UUID, entry_id: UUID, day: LocalDay) -> HydrationToday:
    session = _session()
    rows = (
        session.table("hydration_logs")
        .select("id")
        .eq("id", str(entry_id))
        .eq("user_id", str(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise LookupError("Hydration entry not found")
    session.table("hydration_logs").delete().eq("id", str(entry_id)).eq("user_id", str(user_id)).execute()
    return _summary(user_id, day)
