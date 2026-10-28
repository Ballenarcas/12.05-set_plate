import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from app.core.auth import issue_access_token
from app.core.security import hash_password, verify_password
from app.db.supabase_client import get_supabase
from app.services.user_profile_service import calculate_calorie_goal
from app.schemas.user import (
    UserLoginRequest,
    UserLoginResponse,
    UserOnboardingRequest,
    UserOnboardingResponse,
)

logger = logging.getLogger(__name__)

# Bcrypt comparison against a throwaway hash keeps the failed-login path as
# slow as the successful one, so the response time does not reveal whether an
# email is registered.
_DUMMY_HASH = hash_password("set-and-plate-timing-equalizer")


def _expires_at(expires_at_unix: int) -> datetime:
    return datetime.fromtimestamp(expires_at_unix, tz=timezone.utc)


class OnboardingFacade:
    def __init__(self, supabase_provider=None):
        self.supabase_provider = supabase_provider

    def register(self, payload: UserOnboardingRequest) -> UserOnboardingResponse:
        provider = self.supabase_provider or get_supabase
        user_id = str(uuid.uuid4())
        email = payload.email.strip().lower()
        calorie_goal = calculate_calorie_goal(
            weight=payload.weight,
            height=payload.height,
            age=payload.age,
            gender=payload.gender,
            objective=payload.objective,
        )
        try:
            supabase = provider(admin=True)
            if supabase is None:
                raise HTTPException(status_code=500, detail="Database client is not configured. Please ensure SUPABASE_URL and SUPABASE_KEY are set.")
            existing = (
                supabase.table("users")
                .select("id")
                .eq("email", email)
                .limit(1)
                .execute()
            )
            # Signing up an already-registered email must never overwrite the
            # stored profile (or downgrade a paying account).
            if existing.data:
                raise HTTPException(
                    status_code=409,
                    detail="This email is already registered. Sign in instead.",
                )
            record = {
                "id": user_id, "email": email, "is_premium": False,
                "Name": payload.name, "Surname": payload.surname,
                "weight": float(payload.weight) if payload.weight is not None else None,
                "height": int(payload.height) if payload.height is not None else None,
                "age": int(payload.age) if payload.age is not None else None,
                "gender": payload.gender, "objective": payload.objective,
                "calorie_goal": calorie_goal,
            }
            if payload.password:
                record["password"] = hash_password(payload.password)
            result = supabase.table("users").insert(record).execute()
            saved_id = result.data[0].get("id") if result.data else None
            if saved_id:
                user_id = saved_id
            else:
                saved_user = (
                    supabase.table("users")
                    .select("id")
                    .eq("email", email)
                    .limit(1)
                    .execute()
                )
                if not saved_user.data or not saved_user.data[0].get("id"):
                    raise HTTPException(status_code=500, detail="Could not confirm the saved user profile.")
                user_id = saved_user.data[0]["id"]
        except HTTPException:
            raise
        except Exception as err:
            logger.error("Could not persist user to Supabase: %s", err, exc_info=True)
            raise HTTPException(status_code=500, detail="Could not create the account.") from err
        token, expires_at = issue_access_token(str(user_id))
        return UserOnboardingResponse(status="success", user_id=user_id, name=payload.name,
            surname=payload.surname, email=email, calorie_goal=calorie_goal,
            message=f"Welcome to SET&PLATE, {payload.name}!", saved_to_supabase=True,
            access_token=token, token_expires_at=_expires_at(expires_at))

    def login(self, payload: UserLoginRequest) -> UserLoginResponse:
        """Authenticate a user and return only public profile fields."""
        email = payload.email.strip().lower()
        try:
            supabase = (self.supabase_provider or get_supabase)(admin=True)
            if supabase is None:
                raise HTTPException(
                    status_code=500,
                    detail="Database client is not configured. Please ensure SUPABASE_URL and SUPABASE_KEY are set.",
                )
            # ``*`` keeps the login query independent from the subscription
            # fields, which are read from the separate subscriptions table.
            result = (
                supabase.table("users")
                .select("*")
                .eq("email", email)
                .limit(1)
                .execute()
            )
        except HTTPException:
            raise
        except Exception as err:
            logger.error("Could not authenticate user: %s", err, exc_info=True)
            raise HTTPException(status_code=500, detail="Could not sign in") from err

        user = result.data[0] if result.data else None
        stored_hash = (user or {}).get("password") or _DUMMY_HASH
        if not verify_password(payload.password, stored_hash) or user is None:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        is_premium = bool(user.get("is_premium"))
        premium_plan = None
        premium_started_at = None
        premium_expires_at = None
        if is_premium:
            try:
                subscription_result = (
                    supabase.table("subscriptions")
                    .select("plan,status,current_period_start,current_period_end")
                    .eq("user_id", user["id"])
                    .limit(1)
                    .execute()
                )
            except Exception as err:
                logger.warning("Could not load the user subscription: %s", err)
            else:
                subscription = subscription_result.data[0] if subscription_result.data else None
                if subscription:
                    premium_plan = subscription.get("plan")
                    premium_started_at = subscription.get("current_period_start")
                    premium_expires_at = subscription.get("current_period_end")
                    if subscription.get("status") == "expired":
                        is_premium = False

        token, expires_at = issue_access_token(str(user["id"]))
        return UserLoginResponse(
            id=str(user["id"]),
            email=user["email"],
            name=user.get("Name") or "",
            surname=user.get("Surname") or "",
            is_premium=is_premium,
            premium_plan=premium_plan,
            premium_started_at=premium_started_at,
            premium_expires_at=premium_expires_at,
            age=user.get("age"),
            gender=user.get("gender"),
            weight=user.get("weight"),
            height=user.get("height"),
            objective=user.get("objective"),
            access_token=token,
            token_expires_at=_expires_at(expires_at),
        )


onboarding_facade = OnboardingFacade()
