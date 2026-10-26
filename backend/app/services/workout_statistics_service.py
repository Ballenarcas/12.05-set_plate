import calendar
import logging
import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable
from uuid import UUID

from fastapi import HTTPException

from app.db.supabase_client import get_supabase
from app.schemas.workout_statistics import (
    MuscleGroupVolume,
    VolumeProgressionPoint,
    WorkoutStatisticsRange,
    WorkoutStatisticsResponse,
)

logger = logging.getLogger(__name__)

_RANGE_MONTHS = {"1M": 1, "3M": 3}
_WORKOUT_SELECT = (
    "id,start_time,end_time,"
    "workout_sets(set_number,reps,weight,is_done,exercise_id,"
    "exercises(muscles))"
)


def _shift_months(value: datetime, months: int) -> datetime:
    """Shift a datetime by whole calendar months, clamping the day when needed."""
    month_index = value.month - 1 - months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def resolve_range_bounds(
    range_key: WorkoutStatisticsRange,
    now: datetime | None = None,
) -> tuple[datetime, datetime]:
    """Return the inclusive start and end instants for a statistics range."""
    end = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if range_key == "1W":
        start = end - timedelta(days=7)
    elif range_key in _RANGE_MONTHS:
        start = _shift_months(end, _RANGE_MONTHS[range_key])
    else:
        raise ValueError(f"Unsupported statistics range: {range_key}")
    return start, end


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _to_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _is_completed_set(set_row: dict[str, Any]) -> bool:
    value = set_row.get("is_done", set_row.get("is_completed"))
    if isinstance(value, str):
        return value.strip().lower() in {"true", "t", "1", "yes"}
    if isinstance(value, (int, float)):
        return value == 1
    return value is True


def _first_nested(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return value[0]
    return None


def _primary_muscle(exercise: Any) -> str | None:
    """Use exactly one canonical primary muscle so volume is never double counted.

    The catalogue stores an ordered primary-muscle list; secondary muscles are
    intentionally ignored for distribution. Exercises without primary metadata
    remain unclassified rather than being guessed from their names.
    """
    metadata = _first_nested(exercise)
    if metadata is None:
        return None
    muscles = metadata.get("muscles")
    if isinstance(muscles, str):
        candidates = [muscles]
    elif isinstance(muscles, list):
        candidates = muscles
    else:
        candidates = []
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _local_date(value: datetime, timezone_offset_minutes: int) -> date:
    """Convert a UTC instant to the client's local calendar date.

    JavaScript reports getTimezoneOffset() as UTC minus local time, so a
    positive value means a western timezone.
    """
    offset = max(-1440, min(1440, timezone_offset_minutes))
    return value.astimezone(timezone(timedelta(minutes=-offset))).date()


def _bucket_date(day: date, range_key: WorkoutStatisticsRange) -> date:
    if range_key == "3M":
        return day - timedelta(days=day.weekday())
    return day


def aggregate_workout_statistics(
    rows: Iterable[dict[str, Any]] | None,
    *,
    range_key: WorkoutStatisticsRange,
    start: datetime,
    end: datetime,
    timezone_offset_minutes: int = 0,
) -> WorkoutStatisticsResponse:
    """Aggregate completed workout rows into the basic statistics dashboard data.

    A workout is complete when it has an end_time. A set contributes weighted
    volume only when it is marked done, has positive finite reps and weight, and
    is not a duplicate. Weight is stored in kilograms by the workout log API.
    """
    range_start = _parse_datetime(start)
    range_end = _parse_datetime(end)
    if range_start is None or range_end is None or range_start > range_end:
        raise ValueError("Statistics range bounds are invalid")

    total_workouts = 0
    total_volume = 0.0
    total_duration_seconds = 0
    workouts_with_duration = 0
    eligible_set_count = 0
    progression: dict[date, float] = defaultdict(float)
    muscle_volume: dict[str, float] = defaultdict(float)
    muscle_labels: dict[str, str] = {}
    seen_workouts: set[str] = set()

    for workout_index, row in enumerate(rows or []):
        if not isinstance(row, dict):
            continue
        workout_key = str(row.get("id") or f"row-{workout_index}")
        if workout_key in seen_workouts:
            continue

        started_at = _parse_datetime(row.get("start_time"))
        if started_at is None or started_at < range_start or started_at > range_end:
            continue
        if not row.get("end_time"):
            continue

        seen_workouts.add(workout_key)
        total_workouts += 1

        completed_at = _parse_datetime(row.get("end_time"))
        if completed_at is not None and completed_at > started_at:
            total_duration_seconds += int((completed_at - started_at).total_seconds())
            workouts_with_duration += 1

        bucket = _bucket_date(_local_date(started_at, timezone_offset_minutes), range_key)
        seen_sets: set[tuple[str, str]] = set()
        for set_index, set_row in enumerate(row.get("workout_sets") or []):
            if not isinstance(set_row, dict) or not _is_completed_set(set_row):
                continue

            exercise_id = str(set_row.get("exercise_id") or "")
            set_number = set_row.get("set_number")
            dedupe_key = (
                exercise_id,
                str(set_number) if set_number is not None else f"row-{set_index}",
            )
            if dedupe_key in seen_sets:
                continue
            seen_sets.add(dedupe_key)

            reps = _to_number(set_row.get("reps"))
            weight = _to_number(set_row.get("weight", set_row.get("weight_kg")))
            if reps is None or weight is None or reps <= 0 or weight <= 0:
                continue

            volume = reps * weight
            if not math.isfinite(volume) or volume <= 0:
                continue

            total_volume += volume
            eligible_set_count += 1
            progression[bucket] += volume

            muscle = _primary_muscle(set_row.get("exercises"))
            if muscle is not None:
                muscle_key = muscle.casefold()
                muscle_labels.setdefault(muscle_key, muscle)
                muscle_volume[muscle_key] += volume

    volume_progression = [
        VolumeProgressionPoint(date=day, volume_kg=round(volume, 2))
        for day, volume in sorted(progression.items())
        if volume > 0
    ]
    muscle_group_distribution = [
        MuscleGroupVolume(muscle_group=muscle_labels[key], volume_kg=round(volume, 2))
        for key, volume in muscle_volume.items()
        if volume > 0
    ]
    muscle_group_distribution.sort(key=lambda item: (-item.volume_kg, item.muscle_group.casefold()))
    classified_volume = round(sum(muscle_volume.values()), 2)
    rounded_total_volume = round(total_volume, 2)

    return WorkoutStatisticsResponse(
        range=range_key,
        start_date=range_start,
        end_date=range_end,
        total_workouts=total_workouts,
        total_volume_kg=rounded_total_volume,
        total_duration_seconds=total_duration_seconds,
        workouts_with_duration=workouts_with_duration,
        eligible_set_count=eligible_set_count,
        progression_granularity="week" if range_key == "3M" else "day",
        volume_progression=volume_progression,
        muscle_group_distribution=muscle_group_distribution,
        classified_volume_kg=classified_volume,
        unclassified_volume_kg=round(max(0.0, total_volume - classified_volume), 2),
    )


def get_workout_statistics(
    user_id: UUID,
    range_key: WorkoutStatisticsRange,
    timezone_offset_minutes: int = 0,
    now: datetime | None = None,
) -> WorkoutStatisticsResponse:
    supabase = get_supabase(admin=True)
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured")

    start, end = resolve_range_bounds(range_key, now)
    try:
        rows = (
            supabase.table("workouts")
            .select(_WORKOUT_SELECT)
            .eq("user_id", str(user_id))
            .not_.is_("end_time", "null")
            .gte("start_time", start.isoformat())
            .lte("start_time", end.isoformat())
            .order("start_time")
            .execute()
            .data or []
        )
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Failed to load workout statistics")
        raise HTTPException(status_code=502, detail="Could not load workout statistics") from err

    return aggregate_workout_statistics(
        rows,
        range_key=range_key,
        start=start,
        end=end,
        timezone_offset_minutes=timezone_offset_minutes,
    )
