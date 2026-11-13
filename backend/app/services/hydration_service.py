"""Daily hydration: one row per drink, summed into today's total per user."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.core.local_day import LocalDay
from app.db.supabase_client import get_supabase
from app.schemas.hydration import (
    CUSTOM_GOAL_MAX_ML,
    CUSTOM_GOAL_MIN_ML,
    HydrationEntry,
    HydrationHistoryDay,
    HydrationHistoryWeek,
    HydrationLogCreate,
    HydrationToday,
)

GLASS_ML = 250
DEFAULT_GOAL_ML = 2500
ML_PER_KG = 35  # common wellness heuristic, not a medical recommendation
MIN_GOAL_ML = 1500
MAX_GOAL_ML = 4000

logger = logging.getLogger(__name__)


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


def _custom_goal(value: Any) -> int | None:
    try:
        goal = int(value)
    except (TypeError, ValueError):
        return None
    return goal if CUSTOM_GOAL_MIN_ML <= goal <= CUSTOM_GOAL_MAX_ML else None


def _user_hydration(user_id: UUID) -> tuple[int, int]:
    """Return ``(goal, recommended goal)`` for this user; the custom goal lives on the profile."""
    session = _session()
    try:
        rows = (
            session.table("users")
            .select("weight,hydration_goal_ml")
            .eq("id", str(user_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception:
        # Before the goal-column migration runs, the rest of the card must keep working.
        rows = (
            session.table("users")
            .select("weight")
            .eq("id", str(user_id))
            .limit(1)
            .execute()
            .data
            or []
        )
    row = rows[0] if rows else {}
    recommended = daily_goal_ml(row.get("weight"))
    return _custom_goal(row.get("hydration_goal_ml")) or recommended, recommended


def _earliest_log_date(session: Any, user_id: UUID) -> date | None:
    rows = (
        session.table("hydration_logs")
        .select("log_date")
        .eq("user_id", str(user_id))
        .order("log_date", desc=False)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    try:
        return date.fromisoformat(str(rows[0].get("log_date"))[:10])
    except ValueError:
        return None


def _goal_timeline(session: Any, user_id: UUID) -> list[tuple[date, int]] | None:
    """Every recorded goal change, oldest first; ``None`` before the migration runs."""
    try:
        rows = (
            session.table("hydration_goal_history")
            .select("effective_date,goal_ml")
            .eq("user_id", str(user_id))
            .order("effective_date", desc=False)
            .execute()
            .data
            or []
        )
    except Exception:
        return None
    timeline: list[tuple[date, int]] = []
    for row in rows:
        try:
            effective = date.fromisoformat(str(row.get("effective_date"))[:10])
            goal = int(row.get("goal_ml"))
        except (TypeError, ValueError):
            continue
        if CUSTOM_GOAL_MIN_ML <= goal <= CUSTOM_GOAL_MAX_ML:
            timeline.append((effective, goal))
    return timeline


def _record_goal_change(session: Any, user_id: UUID, changed_on: date, previous_goal: int, new_goal: int) -> None:
    """Append today's goal and keep a baseline so older days never move."""
    try:
        existing = (
            session.table("hydration_goal_history")
            .select("effective_date")
            .eq("user_id", str(user_id))
            .order("effective_date", desc=False)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            baseline = _earliest_log_date(session, user_id) or changed_on
            if baseline < changed_on:
                session.table("hydration_goal_history").upsert(
                    {
                        "user_id": str(user_id),
                        "effective_date": baseline.isoformat(),
                        "goal_ml": previous_goal,
                    },
                    on_conflict="user_id,effective_date",
                ).execute()
        session.table("hydration_goal_history").upsert(
            {
                "user_id": str(user_id),
                "effective_date": changed_on.isoformat(),
                "goal_ml": new_goal,
            },
            on_conflict="user_id,effective_date",
        ).execute()
    except Exception:
        # Before the goal-history migration runs, the goal itself still saves.
        logger.debug("Hydration goal history is unavailable", exc_info=True)


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
    goal, recommended = _user_hydration(user_id)
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
        default_goal_ml=recommended,
        progress_percentage=min(100, round((total / goal) * 100)) if goal > 0 else 0,
        remaining_ml=max(0, goal - total),
        entries=entries,
    )


def set_goal(user_id: UUID, day: LocalDay, goal_ml: int | None) -> HydrationToday:
    """Store the custom goal from today forward; ``None`` restores the recommended goal."""
    session = _session()
    previous_goal, recommended = _user_hydration(user_id)
    session.table("users").update({"hydration_goal_ml": goal_ml}).eq("id", str(user_id)).execute()
    _record_goal_change(session, user_id, day.local_date, previous_goal, recommended if goal_ml is None else goal_ml)
    return _summary(user_id, day)


def get_today(user_id: UUID, day: LocalDay) -> HydrationToday:
    return _summary(user_id, day)


def _week_bounds(requested: date | None, today: date) -> tuple[date, date]:
    """Monday–Sunday of the requested week, never a future week."""
    anchor = min(requested or today, today)
    start = anchor - timedelta(days=anchor.weekday())
    return start, start + timedelta(days=6)


def get_history(user_id: UUID, day: LocalDay, week_start: date | None = None) -> HydrationHistoryWeek:
    """Per-day totals for one local week, each compared with the goal active that day."""
    session = _session()
    start, end = _week_bounds(week_start, day.local_date)
    rows = (
        session.table("hydration_logs")
        .select("log_date,amount_ml")
        .eq("user_id", str(user_id))
        .gte("log_date", start.isoformat())
        .lte("log_date", end.isoformat())
        .execute()
        .data
        or []
    )
    totals: dict[str, int] = defaultdict(int)
    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        key = str(row.get("log_date") or "")[:10]
        totals[key] += int(row.get("amount_ml") or 0)
        counts[key] += 1

    current_goal, recommended = _user_hydration(user_id)
    timeline = _goal_timeline(session, user_id)
    if timeline is None:
        # Before the goal-history migration runs, every day uses the current goal.
        day_goals = [current_goal] * 7
    else:
        # Days before the first recorded change keep the baseline goal, so a
        # later goal change never rewrites an older week.
        baseline = timeline[0][1] if timeline else current_goal
        day_goals = []
        for offset in range(7):
            current = start + timedelta(days=offset)
            goal = baseline
            for effective, effective_goal in timeline:
                if effective <= current:
                    goal = effective_goal
                else:
                    break
            day_goals.append(goal)

    days: list[HydrationHistoryDay] = []
    for offset in range(7):
        current = start + timedelta(days=offset)
        key = current.isoformat()
        total = totals.get(key, 0)
        goal = day_goals[offset]
        days.append(
            HydrationHistoryDay(
                date=current,
                total_ml=total,
                goal_ml=goal,
                progress_percentage=min(100, round((total / goal) * 100)) if goal > 0 else 0,
                met_goal=goal > 0 and total >= goal,
            )
        )

    week_total = sum(item.total_ml for item in days)
    return HydrationHistoryWeek(
        week_start=start,
        week_end=end,
        goal_ml=day_goals[-1],
        default_goal_ml=recommended,
        total_ml=week_total,
        daily_average_ml=round(week_total / 7),
        days_met_goal=sum(1 for item in days if item.met_goal),
        entries_count=sum(counts.get(item.date.isoformat(), 0) for item in days),
        days=days,
    )


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
