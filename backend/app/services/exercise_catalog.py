import json
import logging
import uuid
from pathlib import Path

from app.schemas.exercise import Exercise

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "exercises_catalog.json"
_cached_exercises: list[Exercise] | None = None
_cached_mtime: float | None = None
_cached_by_key: dict[str, Exercise] | None = None


def load_cached_exercises() -> list[Exercise]:
    """Loads exercises from local catalog JSON, keeping a process-wide cache."""
    global _cached_exercises, _cached_mtime, _cached_by_key
    if not CATALOG_PATH.exists():
        return []
    try:
        mtime = CATALOG_PATH.stat().st_mtime
        if _cached_exercises is not None and _cached_mtime == mtime:
            return _cached_exercises
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        exercises = [Exercise(**item) for item in data]
        _cached_exercises = exercises
        _cached_mtime = mtime
        _cached_by_key = {exercise.id: exercise for exercise in exercises}
        return exercises
    except Exception as err:
        logger.error(f"Error reading exercises catalog: {err}")
        return []


def get_cached_exercise(exercise_id: str) -> Exercise | None:
    load_cached_exercises()
    if not _cached_by_key:
        return None
    return _cached_by_key.get(exercise_id)


def supabase_uuid_for(exercise: Exercise) -> str:
    """Deterministic Supabase UUID for a catalog exercise (matches replace_exercises_with_dataset.sql)."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"exercise:{exercise.id}"))


def muscle_group_for(exercise: Exercise) -> str:
    """Return the muscle group value stored in the Supabase exercises table."""
    return exercise.category or (exercise.muscles[0] if exercise.muscles else "General")


def resolve_exercise_log_id(exercise_id: str) -> str:
    """Resolve a catalog id to the Supabase exercise UUID.

    Passes through values that are already UUIDs (e.g. routine exercises from Supabase).
    Raises ValueError for unknown exercise ids.
    """
    try:
        return str(uuid.UUID(exercise_id))
    except ValueError:
        pass
    exercise = get_cached_exercise(exercise_id)
    if exercise is None:
        raise ValueError(f"Unknown exercise '{exercise_id}'")
    return supabase_uuid_for(exercise)
