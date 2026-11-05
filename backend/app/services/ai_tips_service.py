"""Short Home tips chosen by rules from today's meals and training.

No model is called: the rules pick the tip and its numbers, which keeps every
tip inside the safety limits and costs no tokens. Tips only ever add calories
(never a deeper deficit) and add at most one set, and only while the weekly set
count stays within 10% of the previous week.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from app.core.local_day import LocalDay, utc_day
from app.db.supabase_client import get_supabase
from app.services.user_profile_service import calculate_calorie_goal

logger = logging.getLogger(__name__)

TIPS_TABLE = "ai_tips"
WORKOUT_KCAL_BONUS = 100
MAX_WEEKLY_SET_GROWTH = 1.10
PROTEIN_PER_KG = 1.6  # same factor as the dashboard's protein target
OVER_TARGET_RATIO = 1.10
LOW_PROTEIN_RATIO = 0.5
NOT_AVAILABLE = "That change is no longer available, so nothing was changed."


def can_add_set(sets_last_7d: int, planned_today: int, sets_prev_7d: int) -> bool:
    """One more set is allowed only if the 7-day total stays within +10% of the week before."""
    if sets_prev_7d <= 0:
        return False
    return sets_last_7d + planned_today + 1 <= sets_prev_7d * MAX_WEEKLY_SET_GROWTH


def bump_exercise_sets(
    exercises: list[dict[str, Any]], exercise_id: str, change: int = 1,
) -> list[dict[str, Any]] | None:
    """Return a copy with the exercise's sets changed, or None when it is not in the plan."""
    if not any(str(item.get("exercise_id")) == exercise_id for item in exercises):
        return None
    return [
        {**item, "sets": int(item.get("sets") or 0) + change} if str(item.get("exercise_id")) == exercise_id else item
        for item in exercises
    ]


def build_candidates(state: dict[str, Any]) -> list[dict[str, Any]]:
    """Return possible tips, best first. Pure: no database access."""
    goal = int(state["goal"])
    eaten = round(state["eaten_kcal"])
    meals = int(state["meals_count"])
    protein = float(state["protein_eaten"])
    protein_goal = float(state["protein_goal"])
    plan = state.get("plan")
    tips: list[dict[str, Any]] = []

    if state["workouts_done_today"] > 0:
        tips.append({
            "kind": "workout_done_kcal",
            "state_key": "day",
            "message": f"Good job in your training! Add {WORKOUT_KCAL_BONUS} kcal to today's plan?",
            "reasoning": (
                "You finished a workout today, so you burned extra energy. Adding "
                f"{WORKOUT_KCAL_BONUS} kcal helps you recover and never makes your deficit bigger. "
                "It only changes today's goal."
            ),
            "action": {"type": "add_kcal", "kcal": WORKOUT_KCAL_BONUS},
        })
    elif plan and not plan.get("is_rest_day") and plan.get("exercises") and can_add_set(
        state["sets_last_7d"], state["planned_sets_today"], state["sets_prev_7d"],
    ):
        first = plan["exercises"][0]
        total = state["sets_last_7d"] + state["planned_sets_today"] + 1
        tips.append({
            "kind": "add_set",
            "state_key": "day",
            "message": f"You've been consistent lately. Add one set of {first['name']} to today's workout?",
            "reasoning": (
                f"Over the last 7 days you did {state['sets_last_7d']} sets and today's plan has "
                f"{state['planned_sets_today']}. One more set makes {total}, still within 10% of the "
                f"{state['sets_prev_7d']} sets you did the week before, so the increase stays gradual."
            ),
            "action": {"type": "add_set", "exercise_id": str(first["exercise_id"])},
        })

    reading = f"{meals}:{eaten}"
    if meals and protein_goal > 0 and eaten >= goal * 0.5 and protein < protein_goal * LOW_PROTEIN_RATIO:
        tips.append({
            "kind": "protein_behind",
            "state_key": reading,
            "message": f"Protein is a bit low today: {round(protein)} of {round(protein_goal)} g. A protein-rich snack would help.",
            "reasoning": (
                f"You have eaten {eaten} of {goal} kcal but only {round(protein)} g of your "
                f"{round(protein_goal)} g protein target. Protein supports muscle recovery."
            ),
            "action": None,
        })
    if eaten > goal * OVER_TARGET_RATIO:
        tips.append({
            "kind": "over_target",
            "state_key": reading,
            "message": f"You're {eaten - goal} kcal over today's goal. That's fine, no need to make up for it tomorrow.",
            "reasoning": "One day above target rarely changes your progress. Your weekly average matters more than a single day.",
            "action": None,
        })
    if meals and eaten < goal:
        tips.append({
            "kind": "on_track",
            "state_key": reading,
            "message": f"Nice, {meals} meal{'s' if meals != 1 else ''} logged and {goal - eaten} kcal left today.",
            "reasoning": f"Based on {eaten} kcal eaten so far against your {goal} kcal goal.",
            "action": None,
        })
    elif meals and eaten <= goal * OVER_TARGET_RATIO:
        tips.append({
            "kind": "goal_reached",
            "state_key": reading,
            "message": "You've reached today's calorie goal. Nice work!",
            "reasoning": f"You have eaten {eaten} kcal against your {goal} kcal goal.",
            "action": None,
        })
    elif not meals:
        tips.append({
            "kind": "nothing_logged",
            "state_key": "0",
            "message": "Log your first meal so I can tailor today's tips.",
            "reasoning": "There are no meals logged for today yet, so there is nothing to base a tip on.",
            "action": None,
        })
    return tips


def _rows(response: Any) -> list[dict[str, Any]]:
    rows = response.data or []
    return rows if isinstance(rows, list) else [rows]


def collect_state(session: Any, user_id: UUID, day: LocalDay) -> dict[str, Any]:
    uid = str(user_id)
    prev_start = day.start - timedelta(days=13)

    def users():
        return _rows(session.table("users").select("calorie_goal,weight,height,age,gender,objective")
                     .eq("id", uid).limit(1).execute())

    def meals():
        return _rows(session.table("meals").select("calories,proteins").eq("user_id", uid)
                     .gte("consumed_at", day.start.isoformat()).lt("consumed_at", day.end.isoformat()).execute())

    def workouts():
        return _rows(session.table("workouts").select("start_time,end_time,workout_sets(is_done)")
                     .eq("user_id", uid).gte("start_time", prev_start.isoformat()).execute())

    def plan():
        return _rows(session.table("workout_plans").select("is_rest_day,exercises")
                     .eq("user_id", uid).eq("plan_date", day.local_date.isoformat()).limit(1).execute())

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(fn) for fn in (users, meals, workouts, plan)]
        user_rows, meal_rows, workout_rows, plan_rows = (future.result() for future in futures)

    user = user_rows[0] if user_rows else {}
    goal = int(user["calorie_goal"]) if user.get("calorie_goal") else calculate_calorie_goal(
        user.get("weight"), user.get("height"), user.get("age"), user.get("gender"), user.get("objective"),
    )
    goal += kcal_bonus(user_id, day, session)
    weight = float(user.get("weight") or 0)

    week_start = day.start - timedelta(days=6)
    sets_last_7d = sets_prev_7d = workouts_done_today = 0
    for workout in workout_rows:
        try:
            started = datetime.fromisoformat(str(workout["start_time"]).replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        sets = sum(1 for row in workout.get("workout_sets") or [] if row.get("is_done") is not False)
        if started >= week_start:
            sets_last_7d += sets
        else:
            sets_prev_7d += sets
        if day.start <= started < day.end and workout.get("end_time"):
            workouts_done_today += 1

    today_plan = plan_rows[0] if plan_rows else None
    exercises = (today_plan or {}).get("exercises") or []
    return {
        "goal": goal,
        "eaten_kcal": sum(float(row.get("calories") or 0) for row in meal_rows),
        "protein_eaten": sum(float(row.get("proteins") or 0) for row in meal_rows),
        "protein_goal": round(weight * PROTEIN_PER_KG, 1),
        "meals_count": len(meal_rows),
        "workouts_done_today": workouts_done_today,
        "sets_last_7d": sets_last_7d,
        "sets_prev_7d": sets_prev_7d,
        "planned_sets_today": sum(int(item.get("sets") or 0) for item in exercises),
        "plan": {"is_rest_day": bool(today_plan.get("is_rest_day")), "exercises": exercises} if today_plan else None,
    }


def kcal_bonus(user_id: UUID | str, day: LocalDay, session: Any = None) -> int:
    """Calories the user accepted for this day. A missing table must not break the dashboard."""
    try:
        session = session or get_supabase(admin=True)
        rows = _rows(session.table(TIPS_TABLE).select("action").eq("user_id", str(user_id))
                     .eq("status", "accepted").gte("created_at", day.start.isoformat())
                     .lt("created_at", day.end.isoformat()).execute())
    except Exception:
        logger.warning("Could not read accepted calorie tips", exc_info=True)
        return 0
    return sum(int(row["action"].get("kcal") or 0) for row in rows
               if row.get("action") and row["action"].get("type") == "add_kcal")


def _public(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(row["id"]), "kind": row["kind"], "message": row["message"],
            "reasoning": row["reasoning"], "has_action": bool(row.get("action"))}


def get_current_tip(user_id: UUID, day: LocalDay | None = None, session: Any = None) -> dict[str, Any] | None:
    """First candidate the user has not answered. Stored on first display so it can be decided later."""
    session = session or get_supabase(admin=True)
    day = day or utc_day()
    tip_date = day.local_date.isoformat()
    stored = {(row["kind"], row["state_key"]): row for row in _rows(
        session.table(TIPS_TABLE).select("*").eq("user_id", str(user_id))
        .eq("tip_date", tip_date).execute())}
    for tip in build_candidates(collect_state(session, user_id, day)):
        row = stored.get((tip["kind"], tip["state_key"]))
        if row:
            if row["status"] == "pending":
                return _public(row)
            continue
        try:
            inserted = _rows(session.table(TIPS_TABLE).insert(
                {**tip, "user_id": str(user_id), "tip_date": tip_date}).execute())
        except Exception as err:
            if "23505" not in str(err):  # another request stored it first; show the stored one
                raise
            inserted = _rows(session.table(TIPS_TABLE).select("*").eq("user_id", str(user_id))
                             .eq("tip_date", tip_date).eq("kind", tip["kind"])
                             .eq("state_key", tip["state_key"]).execute())
            if inserted and inserted[0]["status"] != "pending":
                continue
        if inserted:
            return _public(inserted[0])
    return None


def _set_status(session: Any, tip_id: str, new: str, old: str) -> list[dict[str, Any]]:
    return _rows(session.table(TIPS_TABLE).update({"status": new}).eq("id", tip_id).eq("status", old).execute())


def _change_planned_sets(
    session: Any, user_id: UUID, exercise_id: str, day: LocalDay, change: int,
) -> bool:
    """Add or remove a set in today's plan. False means the plan can no longer change."""
    state = collect_state(session, user_id, day)
    plan = state["plan"]
    if state["workouts_done_today"] or not plan or plan["is_rest_day"]:
        return False
    if change > 0 and not can_add_set(state["sets_last_7d"], state["planned_sets_today"], state["sets_prev_7d"]):
        return False
    updated = bump_exercise_sets(plan["exercises"], exercise_id, change)
    if updated is None:
        return False
    session.table("workout_plans").update({"exercises": updated, "updated_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("user_id", str(user_id)).eq("plan_date", day.local_date.isoformat()).execute()
    return True


def _confirmation(action: dict[str, Any]) -> str:
    if action.get("type") == "add_set":
        return "Added one set to today's workout."
    return f"Added {action.get('kcal')} kcal to today's goal."


def _find_tip(session: Any, user_id: UUID, tip_id: UUID) -> dict[str, Any]:
    found = _rows(session.table(TIPS_TABLE).select("*").eq("id", str(tip_id)).eq("user_id", str(user_id))
                  .limit(1).execute())
    if not found:
        raise ValueError("Tip not found")
    return found[0]


def _is_today(tip: dict[str, Any], day: LocalDay) -> bool:
    return str(tip["tip_date"]) == day.local_date.isoformat()


def decide_tip(
    user_id: UUID, tip_id: UUID, status: str, day: LocalDay | None = None, session: Any = None,
) -> dict[str, Any]:
    """Dismiss or accept a tip, then return the next one. Repeating a decision changes nothing."""
    if status not in ("accepted", "dismissed"):
        raise ValueError("Invalid decision status")
    session = session or get_supabase(admin=True)
    day = day or utc_day()
    tip = _find_tip(session, user_id, tip_id)
    action = tip.get("action") or {}
    applied, notice = False, None
    is_stale = not _is_today(tip, day)  # a tab left open overnight must not change the new day

    # Claim the tip before applying it, so a double tap cannot apply it twice.
    if tip["status"] == "pending" and _set_status(session, str(tip_id), "dismissed" if is_stale else status, "pending"):
        if status == "accepted" and is_stale:
            notice = NOT_AVAILABLE
        elif status == "accepted" and action.get("type") == "add_set":
            try:
                applied = _change_planned_sets(session, user_id, str(action.get("exercise_id")), day, 1)
            except Exception:
                _set_status(session, str(tip_id), "pending", status)
                raise
            if not applied:
                _set_status(session, str(tip_id), "dismissed", status)
                notice = NOT_AVAILABLE
        elif status == "accepted":
            applied = bool(action)
    return {
        "applied": applied,
        "notice": notice,
        "confirmation": _confirmation(action) if applied else None,
        "tip": get_current_tip(user_id, day, session),
    }


def undo_tip(user_id: UUID, tip_id: UUID, day: LocalDay | None = None, session: Any = None) -> dict[str, Any]:
    """Reverse an accepted tip from today and offer it again. Repeating an undo changes nothing."""
    session = session or get_supabase(admin=True)
    day = day or utc_day()
    tip = _find_tip(session, user_id, tip_id)
    action = tip.get("action") or {}
    undone = False

    if tip["status"] == "accepted" and action and _is_today(tip, day) and _set_status(session, str(tip_id), "pending", "accepted"):
        undone = True
        if action.get("type") == "add_set":
            try:
                undone = _change_planned_sets(session, user_id, str(action.get("exercise_id")), day, -1)
            except Exception:
                _set_status(session, str(tip_id), "accepted", "pending")
                raise
            if not undone:
                _set_status(session, str(tip_id), "accepted", "pending")
    return {
        "applied": undone,
        "notice": "Change undone." if undone else "That change can no longer be undone.",
        "confirmation": None,
        "tip": get_current_tip(user_id, day, session),
    }
