import calendar
import logging
import os
import uuid
from datetime import datetime, timezone

from app.db.supabase_client import get_supabase
from app.schemas.premium import PremiumCancelResponse, PremiumPlan, PremiumPurchaseResponse

logger = logging.getLogger(__name__)

USERS_TABLE_NAME = os.getenv("USERS_TABLE_NAME", "users")
SUBSCRIPTIONS_TABLE_NAME = os.getenv("SUBSCRIPTIONS_TABLE_NAME", "subscriptions")

PLAN_DURATION_MONTHS: dict[PremiumPlan, int] = {
    "annual": 12,
    "monthly": 1,
}

ACTIVE_SUBSCRIPTION_STATUSES = {"active", "trialing"}


def _add_months(value: datetime, months: int) -> datetime:
    """Return a date shifted by whole months, clamping the day when needed."""
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


def _calculate_expiry(start: datetime, plan: PremiumPlan) -> datetime:
    return _add_months(start, PLAN_DURATION_MONTHS[plan])


def _parse_timestamp(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def purchase_premium_db(user_id: str, plan: PremiumPlan) -> PremiumPurchaseResponse:
    """Mock a premium purchase and persist the subscription window."""
    client = get_supabase(admin=True)
    if client is None:
        raise RuntimeError("Database connection unavailable")

    now = datetime.now(timezone.utc).replace(microsecond=0)

    try:
        user_result = (
            client.table(USERS_TABLE_NAME)
            .select("id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as err:
        raise RuntimeError("Could not read your profile. Please try again.") from err

    if not user_result.data:
        raise LookupError("User profile was not found")

    try:
        subscription_result = (
            client.table(SUBSCRIPTIONS_TABLE_NAME)
            .select("*")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as err:
        logger.exception("Could not read the subscription table")
        raise RuntimeError("Could not read your subscription. Please try again.") from err

    existing = subscription_result.data[0] if subscription_result.data else None
    current_end = _parse_timestamp(existing.get("current_period_end")) if existing else None
    has_running_period = (
        bool(existing)
        and existing.get("status") in ACTIVE_SUBSCRIPTION_STATUSES
        and current_end is not None
        and current_end > now
    )
    # A renewal starts where the current period ends; a fresh purchase (or an
    # expired plan) starts right now.
    period_start = current_end if has_running_period and current_end else now
    expires_at = _calculate_expiry(period_start, plan)
    subscription_id = (
        str(existing.get("id"))
        if existing and existing.get("id")
        else str(uuid.uuid4())
    )

    subscription = {
        "id": subscription_id,
        "user_id": user_id,
        "plan": plan,
        "status": "active",
        "current_period_start": period_start.isoformat(),
        "current_period_end": expires_at.isoformat(),
        "cancel_at_period_end": False,
        "updated_at": now.isoformat(),
    }

    try:
        (
            client.table(SUBSCRIPTIONS_TABLE_NAME)
            .upsert(subscription, on_conflict="user_id")
            .execute()
        )
        client.table(USERS_TABLE_NAME).update({"is_premium": True}).eq("id", user_id).execute()
    except Exception as err:
        logger.exception("Could not persist the premium subscription")
        raise RuntimeError("Could not activate premium. Please try again.") from err

    return PremiumPurchaseResponse(
        status="success",
        is_premium=True,
        plan=plan,
        started_at=period_start,
        expires_at=expires_at,
    )


def has_active_premium(user_id: str, client=None) -> bool:
    """True while the paid period is running, including a cancelled one that has not ended yet."""
    client = client or get_supabase(admin=True)
    rows = (
        client.table(SUBSCRIPTIONS_TABLE_NAME)
        .select("status,current_period_end")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows or rows[0].get("status") not in ACTIVE_SUBSCRIPTION_STATUSES:
        return False
    period_end = _parse_timestamp(rows[0].get("current_period_end"))
    return period_end is not None and period_end > datetime.now(timezone.utc)


def cancel_premium_db(user_id: str) -> PremiumCancelResponse:
    """Stop the subscription at period end. Access stays until then; repeating changes nothing."""
    client = get_supabase(admin=True)
    if client is None:
        raise RuntimeError("Database connection unavailable")

    now = datetime.now(timezone.utc).replace(microsecond=0)
    try:
        result = (
            client.table(SUBSCRIPTIONS_TABLE_NAME)
            .select("status,current_period_end")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as err:
        logger.exception("Could not read the subscription table")
        raise RuntimeError("Could not read your subscription. Please try again.") from err

    existing = result.data[0] if result.data else None
    period_end = _parse_timestamp(existing.get("current_period_end")) if existing else None
    if (
        not existing
        or existing.get("status") not in ACTIVE_SUBSCRIPTION_STATUSES
        or period_end is None
        or period_end <= now
    ):
        raise LookupError("There is no active subscription to cancel")

    try:
        (
            client.table(SUBSCRIPTIONS_TABLE_NAME)
            .update({"cancel_at_period_end": True, "updated_at": now.isoformat()})
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as err:
        logger.exception("Could not cancel the premium subscription")
        raise RuntimeError("Could not cancel the subscription. Please try again.") from err

    return PremiumCancelResponse(status="success", cancel_at_period_end=True, expires_at=period_end)
