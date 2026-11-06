"""Curated strength-training templates and plan quality checks.

Routine quality lives here instead of in the model prompt: exercises come from a
vetted allowlist organised by movement pattern, the session skeleton is chosen by
code, and every generated plan is validated against basic programming rules.
"""

from __future__ import annotations

import json
import random
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.exercise_catalog import load_cached_exercises, supabase_uuid_for

STAPLES_PATH = Path(__file__).resolve().parent.parent / "data" / "exercise_staples.json"

TARGET_EXERCISES = 6
MAX_EXERCISES = 8
MIN_EXERCISES = 5
MAX_SETS = 6
MIN_SETS = 1
MAX_REPS = 30
MIN_REPS = 1

# One exercise per movement pattern, in training order (compounds first).
TEMPLATES: dict[str, list[str]] = {
    "full_body": ["squat", "horizontal_push", "horizontal_pull", "hinge", "vertical_push", "core", "calves"],
    "upper": ["horizontal_push", "horizontal_pull", "vertical_push", "vertical_pull", "lateral_raise", "biceps", "triceps"],
    "lower": ["squat", "hinge", "leg_extension", "leg_curl", "calves", "core"],
    "push": ["horizontal_push", "vertical_push", "chest_fly", "lateral_raise", "triceps", "core"],
    "pull": ["vertical_pull", "horizontal_pull", "rear_delt", "biceps", "shrug", "core"],
    "legs": ["squat", "hinge", "leg_extension", "leg_curl", "calves", "core"],
}

TEMPLATE_LABELS = {
    "full_body": "Full body",
    "upper": "Upper body",
    "lower": "Lower body",
    "push": "Push day",
    "pull": "Pull day",
    "legs": "Leg day",
}

# Accessories used to reach the target size when a template has fewer slots.
FILL_ORDER = [
    "core", "calves", "lateral_raise", "biceps", "triceps", "rear_delt",
    "chest_fly", "shrug", "leg_curl", "leg_extension", "hip_thrust",
    "vertical_pull", "horizontal_pull", "lunge",
]

UPPER_GROUPS = {"chest", "back", "shoulders", "arms", "abs"}
LOWER_GROUPS = {"legs", "calves"}

_COMPOUND_MOVEMENTS = frozenset({
    "squat", "hinge", "lunge", "horizontal_push", "vertical_push",
    "horizontal_pull", "vertical_pull", "hip_thrust",
})


@lru_cache(maxsize=1)
def load_staples() -> dict[str, dict[str, Any]]:
    """Return the vetted exercise allowlist keyed by catalog id."""
    try:
        data = json.loads(STAPLES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    exercises = data.get("exercises") if isinstance(data, dict) else None
    if not isinstance(exercises, list):
        return {}
    return {str(item["exercise_id"]): item for item in exercises if isinstance(item, dict) and item.get("exercise_id")}


def _staple_index_by_supabase_id() -> dict[str, dict[str, Any]]:
    """Map Supabase exercise UUIDs to their allowlist metadata."""
    staples = load_staples()
    if not staples:
        return {}
    index: dict[str, dict[str, Any]] = {}
    for exercise in load_cached_exercises():
        staple = staples.get(exercise.id)
        if staple is None:
            continue
        index[supabase_uuid_for(exercise)] = {
            "movement": str(staple.get("movement") or "other"),
            "tier": str(staple.get("tier") or "B"),
            "compound": bool(staple.get("compound")),
            "priority": int(staple.get("priority") or 50),
        }
    return index


def recent_covers_whole_body(recent_muscle_groups: set[str]) -> bool:
    trained = {group.strip().lower() for group in recent_muscle_groups if group}
    return bool(trained & UPPER_GROUPS) and bool(trained & LOWER_GROUPS)


def choose_template(recent_muscle_groups: set[str]) -> str:
    """Pick a split that does not repeat the side trained in the last 48 hours."""
    trained = {group.strip().lower() for group in recent_muscle_groups if group}
    trained_upper = bool(trained & UPPER_GROUPS)
    trained_lower = bool(trained & LOWER_GROUPS)
    if trained_upper and not trained_lower:
        return "lower"
    if trained_lower and not trained_upper:
        return "upper"
    return "full_body"


def objective_guidance(objective: str | None) -> dict[str, Any]:
    """Translate the stored free-text goal into concrete set and rep ranges."""
    text = (objective or "").lower()
    if any(key in text for key in ("strength", "fuerza", "power", "potencia")):
        return {
            "branch": "strength", "min_sets": 3, "max_sets": 5,
            "min_reps": 3, "max_reps": 6, "rest_seconds": 150,
            "summary": "heavy compounds, low reps, long rest",
        }
    if any(key in text for key in ("weight loss", "lose", "fat", "grasa", "cut", "deficit", "déficit")):
        return {
            "branch": "fat_loss", "min_sets": 2, "max_sets": 4,
            "min_reps": 8, "max_reps": 15, "rest_seconds": 75,
            "summary": "higher reps, shorter rest, keep the heart rate up",
        }
    if any(key in text for key in ("endurance", "resistencia", "cardio")):
        return {
            "branch": "endurance", "min_sets": 2, "max_sets": 4,
            "min_reps": 12, "max_reps": 20, "rest_seconds": 60,
            "summary": "moderate load, high reps, short rest",
        }
    return {
        "branch": "muscle_gain", "min_sets": 3, "max_sets": 4,
        "min_reps": 6, "max_reps": 12, "rest_seconds": 120,
        "summary": "progressive overload, moderate reps, controlled tempo",
    }


def build_session(
    catalog: list[dict[str, Any]],
    blocked_muscle_groups: set[str],
    recent_exercise_ids: set[str],
    seed: str,
) -> dict[str, Any] | None:
    """Build an ordered session skeleton from the allowlist, or None if unavailable."""
    staple_index = _staple_index_by_supabase_id()
    if not staple_index:
        return None
    blocked = {group.strip().lower() for group in blocked_muscle_groups if group}
    candidates: list[dict[str, Any]] = []
    for row in catalog:
        exercise_id = str(row.get("id") or "")
        meta = staple_index.get(exercise_id)
        if meta is None or exercise_id in recent_exercise_ids:
            continue
        if str(row.get("muscle_group") or "").strip().lower() in blocked:
            continue
        candidates.append({**row, "exercise_id": exercise_id, **meta})
    if not candidates:
        return None

    generator = random.Random(seed)
    by_movement: dict[str, list[dict[str, Any]]] = {}
    for row in candidates:
        by_movement.setdefault(row["movement"], []).append(row)
    for rows in by_movement.values():
        generator.shuffle(rows)
        # Stable sort keeps the day seed as the tie-break between equally good picks.
        rows.sort(key=lambda row: (row["priority"], row["tier"] != "A"))

    template = choose_template(blocked_muscle_groups)
    slots: list[dict[str, Any]] = []
    used: set[str] = set()
    for movement in TEMPLATES[template]:
        options = [row for row in by_movement.get(movement, []) if row["exercise_id"] not in used]
        if options:
            slots.append({"movement": movement, "candidates": options[:3]})
            used.update(row["exercise_id"] for row in options[:3])
    for movement in FILL_ORDER:
        if len(slots) >= TARGET_EXERCISES:
            break
        if any(slot["movement"] == movement for slot in slots):
            continue
        options = [row for row in by_movement.get(movement, []) if row["exercise_id"] not in used]
        if options:
            slots.append({"movement": movement, "candidates": options[:3]})
            used.update(row["exercise_id"] for row in options[:3])
    if len(slots) < MIN_EXERCISES - 1:
        return None
    return {"template": template, "label": TEMPLATE_LABELS[template], "slots": slots[:MAX_EXERCISES]}


def session_pool(session: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten the session candidates for the prompt and for id validation."""
    pool: list[dict[str, Any]] = []
    seen: set[str] = set()
    for slot in session["slots"]:
        for row in slot["candidates"]:
            exercise_id = row["exercise_id"]
            if exercise_id in seen:
                continue
            seen.add(exercise_id)
            pool.append({**row, "slot": slot["movement"]})
    return pool


def plan_errors(
    exercises: list[dict[str, Any]],
    pool_by_id: dict[str, dict[str, Any]],
    guidance: dict[str, Any],
    min_exercises: int = MIN_EXERCISES,
) -> list[str]:
    """Return the programming rules a generated plan breaks."""
    errors: list[str] = []
    if not (min_exercises <= len(exercises) <= MAX_EXERCISES):
        errors.append(f"use {min_exercises} to {TARGET_EXERCISES} exercises")
    ids = [str(item.get("exercise_id")) for item in exercises]
    if len(set(ids)) != len(ids):
        errors.append("each exercise may appear only once")
    unknown = [exercise_id for exercise_id in ids if exercise_id not in pool_by_id]
    if unknown:
        errors.append("every exercise must come from the supplied list")
    rows = [pool_by_id[exercise_id] for exercise_id in ids if exercise_id in pool_by_id]
    movements = [row["movement"] for row in rows]
    if len(set(movements)) != len(movements):
        errors.append("do not repeat a movement pattern")
    if rows and not any(row["compound"] for row in rows[:2]):
        errors.append("start with compound lifts")
    for item in exercises:
        sets, reps = item.get("sets"), item.get("reps")
        if not isinstance(sets, int) or isinstance(sets, bool) or not (MIN_SETS <= sets <= MAX_SETS):
            errors.append(f"sets must be between {MIN_SETS} and {MAX_SETS}")
            break
    for item in exercises:
        reps = item.get("reps")
        if not isinstance(reps, int) or isinstance(reps, bool) or not (MIN_REPS <= reps <= MAX_REPS):
            errors.append(f"reps must be between {MIN_REPS} and {MAX_REPS}")
            break
    return errors


_FINISHER_MOVEMENTS = frozenset({"core", "calves"})


def prescription(
    movement: str, compound: bool, guidance: dict[str, Any], position: int,
) -> tuple[int, int]:
    """Sets and reps for one exercise, based on its role in the session."""
    span = guidance["max_reps"] - guidance["min_reps"]
    if compound:
        sets = guidance["max_sets"]
        reps = guidance["min_reps"] + span // 3 + position // 2
    elif movement in _FINISHER_MOVEMENTS:
        sets = guidance["min_sets"]
        reps = guidance["max_reps"]
    else:
        sets = max(guidance["min_sets"], guidance["max_sets"] - 1)
        reps = guidance["min_reps"] + (2 * span) // 3 + position % 2
    return (
        max(MIN_SETS, min(int(sets), MAX_SETS)),
        max(MIN_REPS, min(int(reps), MAX_REPS)),
    )


def apply_prescription(
    exercises: list[dict[str, Any]],
    pool_by_id: dict[str, dict[str, Any]],
    guidance: dict[str, Any],
) -> list[dict[str, Any]]:
    """Assign role-based sets and reps so a session is not one flat 3x10."""
    for position, item in enumerate(exercises):
        row = pool_by_id.get(str(item.get("exercise_id")))
        if row is None:
            continue
        item["sets"], item["reps"] = prescription(
            str(row.get("movement") or "other"),
            bool(row.get("compound")),
            guidance,
            position,
        )
    return exercises


def fallback_exercises(session: dict[str, Any], guidance: dict[str, Any]) -> list[dict[str, Any]]:
    """Deterministic template plan used when the model cannot produce a valid one."""
    exercises: list[dict[str, Any]] = []
    for position, slot in enumerate(session["slots"][:TARGET_EXERCISES]):
        row = slot["candidates"][0]
        sets, reps = prescription(slot["movement"], bool(row["compound"]), guidance, position)
        exercises.append({
            "exercise_id": row["exercise_id"],
            "sets": sets,
            "reps": reps,
        })
    return exercises


def clamp_targets(
    exercises: list[dict[str, Any]], guidance: dict[str, Any],
) -> list[dict[str, Any]]:
    """Keep the model's choices but move sets and reps into the goal range."""
    for item in exercises:
        item["sets"] = max(guidance["min_sets"], min(int(item["sets"]), guidance["max_sets"]))
        item["reps"] = max(guidance["min_reps"], min(int(item["reps"]), guidance["max_reps"]))
    return exercises
