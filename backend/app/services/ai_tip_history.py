"""Turn recent meals and workouts into the facts that make tips personal. Pure: no database access."""

import re
from datetime import datetime, timedelta
from typing import Any

from app.core.local_day import LocalDay

HISTORY_DAYS = 30
ON_GOAL_BAND = 0.10
MUSCLE_GAP_DAYS = 8
MAX_NAME_LENGTH = 40
IGNORED_MUSCLES = {"Cardio"}  # not a muscle a user would miss training


def instant(value: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


def clean_name(value: Any) -> str:
    return " ".join(str(value or "").split())[:MAX_NAME_LENGTH]


def meal_label(value: Any) -> str:
    """A meal name without its numbers: users type these, so they must not become trusted figures."""
    return clean_name(re.sub(r"\d+(?:[.,]\d+)*\s*(?:kcal|kg|g)?\b", " ", str(value or "")))


def days_ago(moment: datetime, day: LocalDay) -> int:
    return -((moment - day.start) // timedelta(days=1))


def weight_text(value: float) -> str:
    return f"{value:g}"


def summarize_meals(rows: list[dict[str, Any]], day: LocalDay, goal: int) -> dict[str, Any]:
    totals: dict[int, dict[str, float]] = {}
    latest: tuple[datetime, dict[str, Any]] | None = None
    for row in rows:
        moment = instant(row.get("consumed_at"))
        if moment is None or moment >= day.end:
            continue
        age = days_ago(moment, day)
        total = totals.setdefault(age, {"kcal": 0.0, "protein": 0.0})
        total["kcal"] += float(row.get("calories") or 0)
        total["protein"] += float(row.get("proteins") or 0)
        if age == 0 and (latest is None or moment > latest[0]):
            latest = (moment, row)

    week = [totals[age] for age in range(1, 8) if age in totals]
    last_meal = None
    if latest and meal_label(latest[1].get("name")):
        last_meal = {"name": meal_label(latest[1].get("name")), "protein": round(float(latest[1].get("proteins") or 0))}
    yesterday = totals.get(1)
    return {
        "logged_days": set(totals),
        "last_meal": last_meal,
        "week_days_logged": len(week),
        "week_protein_avg": round(sum(item["protein"] for item in week) / len(week)) if week else None,
        "week_days_on_goal": sum(1 for item in week if abs(item["kcal"] - goal) <= goal * ON_GOAL_BAND),
        "yesterday": {"kcal": round(yesterday["kcal"]), "protein": round(yesterday["protein"])} if yesterday else None,
    }


def summarize_workouts(rows: list[dict[str, Any]], day: LocalDay) -> dict[str, Any]:
    best_today: dict[str, float] = {}
    best_before: dict[str, float] = {}
    muscle_age: dict[str, int] = {}
    today_rpe: list[float] = []
    latest: tuple[int, str] | None = None

    for workout in rows:
        started = instant(workout.get("start_time"))
        if started is None or not workout.get("end_time") or started >= day.end:
            continue
        age = days_ago(started, day)
        if latest is None or age < latest[0]:
            latest = (age, clean_name(workout.get("name")))
        for item in workout.get("workout_sets") or []:
            if item.get("is_done") is False:
                continue
            exercise = item.get("exercises") or {}
            muscle = exercise.get("muscle_group")
            if muscle and muscle not in IGNORED_MUSCLES:
                muscle_age[muscle] = min(age, muscle_age.get(muscle, age))
            if age == 0 and item.get("rpe") is not None:
                today_rpe.append(float(item["rpe"]))
            name = clean_name(exercise.get("name"))
            weight = float(item.get("weight") or 0)
            if name and weight > 0:
                best = best_today if age == 0 else best_before
                best[name] = max(weight, best.get(name, 0))

    gains = [(best_today[name] - best_before[name], name) for name in best_today
             if name in best_before and best_today[name] > best_before[name]]
    lift_progress = None
    if gains:
        name = max(gains)[1]
        lift_progress = {"exercise": name, "before": weight_text(best_before[name]), "after": weight_text(best_today[name])}

    muscle_gap = None
    if muscle_age:
        muscle, age = max(muscle_age.items(), key=lambda item: item[1])
        if age >= MUSCLE_GAP_DAYS:
            muscle_gap = {"muscle": muscle, "days": age}

    return {
        "days_since_workout": latest[0] if latest else None,
        "last_workout_name": latest[1] if latest else "",
        "today_rpe": round(sum(today_rpe) / len(today_rpe), 1) if today_rpe else None,
        "lift_progress": lift_progress,
        "muscle_gap": muscle_gap,
    }


def personal_facts(state: dict[str, Any]) -> list[str]:
    """Short facts about this user for the model. Numbers here are the only extra ones it may use."""
    hour = state.get("local_hour", 12)
    part = "morning" if hour < 12 else "afternoon" if hour < 19 else "evening"
    facts = [
        f"Time of day: {part}",
        f"Today so far: {round(state['eaten_kcal'])} of {state['goal']} kcal, "
        f"{round(state['protein_eaten'])} of {round(state['protein_goal'])} g protein",
    ]
    if state.get("objective"):
        facts.append(f"Their goal: {state['objective']}")
    if state.get("last_meal"):
        meal = state["last_meal"]
        facts.append(f"Latest meal today: {meal['name']} with {meal['protein']} g protein")
    if state.get("yesterday"):
        facts.append(f"Yesterday: {state['yesterday']['kcal']} kcal, {state['yesterday']['protein']} g protein")
    if state.get("week_days_logged"):
        facts.append(f"Past week: logged {state['week_days_logged']} days, protein average {state['week_protein_avg']} g, "
                     f"on calorie goal {state['week_days_on_goal']} days")
    if state.get("days_since_workout") is not None:
        name = state.get("last_workout_name")
        facts.append(f"Last workout: {state['days_since_workout']} days ago" + (f" ({name})" if name else ""))
    if state.get("today_rpe"):
        facts.append(f"Effort in today's workout: {state['today_rpe']} out of 10")
    if state.get("lift_progress"):
        lift = state["lift_progress"]
        facts.append(f"New best today: {lift['exercise']} {lift['after']} kg, previous {lift['before']} kg")
    if state.get("muscle_gap"):
        facts.append(f"Not trained for {state['muscle_gap']['days']} days: {state['muscle_gap']['muscle']}")
    if state.get("streak_days", 0) >= 2:
        facts.append(f"Meal logging streak: {state['streak_days']} days")
    return facts
