"""Calorie goal adjustments from the last 7 days of logged data.

Pure rules first (propose_adjustment), then a thin service that reads the
existing tables, persists one pending proposal per user, and applies the new
goal to users.calorie_goal when the user accepts.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

from app.db.supabase_client import get_supabase

ADJUSTMENTS_TABLE = "ai_calorie_adjustments"
EVALUATION_DAYS = 7
REVIEW_COOLDOWN_DAYS = 7
COMPLIANCE_BAND = 0.10
LOW_COMPLIANCE = 0.50
HIGH_COMPLIANCE = 0.80
FAT_LOSS_STEP = 150
MUSCLE_GAIN_STEP = 200
MIN_STEP = 100
MIN_GOAL = 1200
MAX_GOAL = 5000

ObjectiveBranch = Literal["fat_loss", "muscle_gain", "maintenance"]


def classify_objective(objective: str | None) -> ObjectiveBranch:
    """Map the free-text objective stored in users to one of the three rule branches."""
    text = (objective or "").lower()
    if "lose" in text or "fat" in text or "cut" in text:
        return "fat_loss"
    if "hypertrophy" in text or "strength" in text or "muscle" in text or "gain" in text:
        return "muscle_gain"
    return "maintenance"


def propose_adjustment(metrics: dict[str, Any]) -> dict[str, Any]:
    """Return {has_change, proposed_goal, reason}. Deterministic, no database access."""
    goal = int(metrics.get("goal") or 0)
    if goal <= 0:
        return {
            "has_change": False,
            "proposed_goal": goal,
            "reason": "Set your daily calorie goal in Settings before the target can be tuned.",
        }

    compliance = float(metrics.get("compliance") or 0.0)
    days_within = int(metrics.get("days_within") or 0)
    if compliance < LOW_COMPLIANCE:
        return {
            "has_change": False,
            "proposed_goal": goal,
            "reason": (
                f"Consistency first: only {days_within} of {EVALUATION_DAYS} days landed within "
                f"10% of your {goal} kcal goal. Log every day for a week before the target moves."
            ),
        }

    if compliance < HIGH_COMPLIANCE:
        return {
            "has_change": False,
            "proposed_goal": goal,
            "reason": (
                f"You are close. {days_within} of {EVALUATION_DAYS} days stayed on target; "
                "reach 6 of 7 before the goal changes."
            ),
        }

    objective = classify_objective(metrics.get("objective"))
    avg_intake = int(metrics.get("avg_intake") or 0)

    if objective == "fat_loss":
        if avg_intake < goal * 0.98:
            return {
                "has_change": False,
                "proposed_goal": goal,
                "reason": (
                    f"Your average intake is {avg_intake} kcal against a {goal} kcal goal, so the "
                    "deficit is working. Hold the target."
                ),
            }
        reduction = min(FAT_LOSS_STEP, goal - MIN_GOAL)
        if reduction < MIN_STEP:
            return {
                "has_change": False,
                "proposed_goal": goal,
                "reason": (
                    f"Your goal is already at the {MIN_GOAL} kcal safety floor, so it stays there."
                ),
            }
        proposed = goal - reduction
        return {
            "has_change": True,
            "proposed_goal": proposed,
            "reason": (
                f"Your average intake is {avg_intake} kcal against a {goal} kcal goal, so the "
                f"deficit is not happening. Lowering the target by {goal - proposed} kcal."
            ),
        }

    if objective == "muscle_gain":
        volume_now = int(metrics.get("volume_this_week") or 0)
        volume_before = int(metrics.get("volume_prev_week") or 0)
        if volume_before <= 0 or volume_now <= volume_before:
            return {
                "has_change": False,
                "proposed_goal": goal,
                "reason": (
                    "Training volume is not rising yet, so keep intake steady until it does."
                ),
            }
        proposed = min(MAX_GOAL, goal + MUSCLE_GAIN_STEP)
        if proposed <= goal:
            return {
                "has_change": False,
                "proposed_goal": goal,
                "reason": f"Your goal is at the {MAX_GOAL} kcal ceiling, so it stays there.",
            }
        return {
            "has_change": True,
            "proposed_goal": proposed,
            "reason": (
                f"Training volume rose from {volume_before} kg to {volume_now} kg this week with "
                f"{days_within} of {EVALUATION_DAYS} days on target. Raising the target by "
                f"{proposed - goal} kcal."
            ),
        }

    return {
        "has_change": False,
        "proposed_goal": goal,
        "reason": (
            f"Maintenance: {days_within} of {EVALUATION_DAYS} days matched your {goal} kcal goal. "
            "Keeping the target steady."
        ),
    }


def _rows(response: Any) -> list[dict[str, Any]]:
    rows = response.data or []
    return rows if isinstance(rows, list) else [rows]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _day_key(consumed_at: Any) -> str | None:
    if not consumed_at:
        return None
    text = str(consumed_at).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).astimezone(timezone.utc).date().isoformat()
    except ValueError:
        return text[:10]


def collect_metrics(session: Any, user_id: UUID, today: str | None = None) -> dict[str, Any]:
    """Read users, meals and workout sets from the existing tables. Seven day window."""
    day = today or _utc_now().date().isoformat()
    window_start = datetime.fromisoformat(f"{day}T00:00:00+00:00") - timedelta(days=EVALUATION_DAYS - 1)
    volume_start = window_start - timedelta(days=EVALUATION_DAYS)

    users = _rows(
        session.table("users").select("calorie_goal,objective")
        .eq("id", str(user_id)).limit(1).execute()
    )
    user = users[0] if users else {}
    goal = int(user.get("calorie_goal") or 0)

    meals = _rows(
        session.table("meals").select("calories,consumed_at")
        .eq("user_id", str(user_id))
        .gte("consumed_at", window_start.isoformat()).execute()
    )
    daily: dict[str, float] = {}
    for row in meals:
        key = _day_key(row.get("consumed_at"))
        if key:
            daily[key] = daily.get(key, 0.0) + float(row.get("calories") or 0)

    days_within = 0
    if goal > 0:
        band = goal * COMPLIANCE_BAND
        days_within = sum(1 for total in daily.values() if abs(total - goal) <= band)

    workouts = _rows(
        session.table("workouts")
        .select("id,start_time,workout_sets(weight,reps,is_done)")
        .eq("user_id", str(user_id))
        .gte("start_time", volume_start.isoformat()).execute()
    )
    volume_this_week = 0.0
    volume_prev_week = 0.0
    for workout in workouts:
        started = workout.get("start_time")
        if not started:
            continue
        try:
            started_at = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
        except ValueError:
            continue
        volume = 0.0
        for set_row in workout.get("workout_sets") or []:
            if set_row.get("is_done") is False:
                continue
            volume += float(set_row.get("weight") or 0) * float(set_row.get("reps") or 0)
        if started_at >= window_start:
            volume_this_week += volume
        else:
            volume_prev_week += volume

    total_calories = sum(daily.values())
    return {
        "goal": goal,
        "objective": user.get("objective"),
        "avg_intake": round(total_calories / EVALUATION_DAYS),
        "days_logged": len(daily),
        "days_within": days_within,
        "compliance": round(days_within / EVALUATION_DAYS, 2),
        "volume_this_week": round(volume_this_week),
        "volume_prev_week": round(volume_prev_week),
    }


def _response(row: dict[str, Any], metrics: dict[str, Any] | None = None) -> dict[str, Any]:
    previous = int(row.get("previous_goal") or 0)
    proposed = int(row.get("proposed_goal") or 0)
    data = {
        "adjustment_id": str(row.get("id")) if row.get("id") else None,
        "previous_goal": previous,
        "proposed_goal": proposed,
        "has_change": proposed != previous,
        "reason": str(row.get("reason") or ""),
        "status": str(row.get("status") or "pending"),
        "objective": classify_objective((metrics or {}).get("objective")),
        "avg_daily_intake": int((metrics or {}).get("avg_intake") or 0),
        "compliance_rate": float((metrics or {}).get("compliance") or 0.0),
        "weekly_volume": int((metrics or {}).get("volume_this_week") or 0),
    }
    return data


def _is_within_cooldown(created_at: Any, now: datetime) -> bool:
    if not created_at:
        return False
    try:
        created = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    return (now - created) < timedelta(days=REVIEW_COOLDOWN_DAYS)


def _is_missing_table(error: Exception) -> bool:
    text = str(error)
    return "PGRST205" in text or "does not exist" in text or "schema cache" in text


def _missing_table_error(error: Exception) -> RuntimeError:
    return RuntimeError(
        f"{ADJUSTMENTS_TABLE} table is missing. Run create_ai_calorie_adjustments_table.sql."
    )


def _latest_rows(session: Any, user_id: UUID, status: str | None = None) -> list[dict[str, Any]]:
    query = session.table(ADJUSTMENTS_TABLE).select("*").eq("user_id", str(user_id))
    if status:
        query = query.eq("status", status)
    return _rows(query.order("created_at", desc=True).limit(1).execute())


def _find_adjustment(session: Any, user_id: UUID, adjustment_id: UUID) -> dict[str, Any]:
    found = _rows(
        session.table(ADJUSTMENTS_TABLE).select("*")
        .eq("id", str(adjustment_id)).eq("user_id", str(user_id)).limit(1).execute()
    )
    if not found:
        raise ValueError("Adjustment not found")
    return found[0]


def _decided_response(row: dict[str, Any]) -> dict[str, Any]:
    result = _response(row)
    accepted = str(row.get("status")) == "accepted"
    goal = row.get("proposed_goal") if accepted else row.get("previous_goal")
    result["calorie_goal"] = int(goal or 0)
    return result


def get_adjustment(
    user_id: UUID,
    db_session: Any = None,
    today: str | None = None,
) -> dict[str, Any]:
    """Return the current proposal. A decided one is not recomputed until the cooldown ends."""
    session = db_session or get_supabase(admin=True)
    try:
        latest = _latest_rows(session, user_id)
    except Exception as err:
        if _is_missing_table(err):
            raise _missing_table_error(err) from err
        raise

    metrics = collect_metrics(session, user_id, today)
    if latest:
        row = latest[0]
        if row.get("status") == "pending" or _is_within_cooldown(row.get("created_at"), _utc_now()):
            return _response(row, metrics)

    proposal = propose_adjustment(metrics)
    if not proposal["has_change"]:
        return _response({
            "id": None,
            "previous_goal": metrics["goal"],
            "proposed_goal": metrics["goal"],
            "reason": proposal["reason"],
            "status": "advice",
        }, metrics)

    payload = {
        "user_id": str(user_id),
        "previous_goal": metrics["goal"],
        "proposed_goal": proposal["proposed_goal"],
        "reason": proposal["reason"],
        "status": "pending",
    }
    try:
        inserted = _rows(
            session.table(ADJUSTMENTS_TABLE).insert(payload).select("*").execute()
        )
    except Exception as err:
        if _is_missing_table(err):
            raise _missing_table_error(err) from err
        if "23505" in str(err):
            existing = _latest_rows(session, user_id, status="pending")
            if existing:
                return _response(existing[0], metrics)
        raise
    if not inserted:
        raise RuntimeError("Supabase did not return the saved adjustment")
    return _response(inserted[0], metrics)


def decide_adjustment(
    user_id: UUID,
    adjustment_id: UUID,
    status: str,
    db_session: Any = None,
) -> dict[str, Any]:
    """Accept applies proposed_goal to users.calorie_goal. An already decided proposal is returned as is."""
    if status not in ("accepted", "rejected"):
        raise ValueError("Invalid decision status")
    session = db_session or get_supabase(admin=True)
    row = _find_adjustment(session, user_id, adjustment_id)
    if str(row.get("status") or "") != "pending":
        return _decided_response(row)

    applied_goal = int(row.get("previous_goal") or 0)
    if status == "accepted":
        updated_users = _rows(
            session.table("users")
            .update({"calorie_goal": int(row.get("proposed_goal") or 0)})
            .eq("id", str(user_id)).select("calorie_goal").execute()
        )
        if not updated_users:
            raise RuntimeError("Could not apply the new calorie goal")
        applied_goal = int(updated_users[0].get("calorie_goal") or 0)

    flipped = _rows(
        session.table(ADJUSTMENTS_TABLE).update({"status": status})
        .eq("id", str(adjustment_id)).eq("status", "pending").select("*").execute()
    )
    if not flipped:
        return _decided_response(_find_adjustment(session, user_id, adjustment_id))
    result = _response(flipped[0])
    result["calorie_goal"] = applied_goal
    return result
