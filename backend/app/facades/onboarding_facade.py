import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import HTTPException

from app.core.auth import issue_access_token
from app.core.config import get_settings
from app.core.reset_quota import allow_reset_email
from app.core.security import hash_password, verify_password
from app.db.supabase_client import get_supabase
from app.services.user_profile_service import calculate_calorie_goal
from app.schemas.user import (
    PasswordResetConfirm,
    PasswordResetRequest,
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


RESET_LINK_MINUTES = 30
INVALID_RESET_LINK = "This link is invalid or has expired. Ask for a new one."


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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
                raise HTTPException(status_code=503, detail="Service unavailable. Please try again.")
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
                "password": hash_password(payload.password),
            }
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
                raise HTTPException(status_code=503, detail="Service unavailable. Please try again.")
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
        stored_hash = (user or {}).get("password")
        if not verify_password(payload.password, stored_hash or _DUMMY_HASH) or not stored_hash:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        is_premium = bool(user.get("is_premium"))
        premium_plan = None
        premium_started_at = None
        premium_expires_at = None
        premium_cancel_at_period_end = False
        if is_premium:
            try:
                subscription_result = (
                    supabase.table("subscriptions")
                    .select("plan,status,current_period_start,current_period_end,cancel_at_period_end")
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
                    premium_cancel_at_period_end = bool(subscription.get("cancel_at_period_end"))
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
            premium_cancel_at_period_end=premium_cancel_at_period_end,
            age=user.get("age"),
            gender=user.get("gender"),
            weight=user.get("weight"),
            height=user.get("height"),
            objective=user.get("objective"),
            access_token=token,
            token_expires_at=_expires_at(expires_at),
        )

    def request_password_reset(self, payload: PasswordResetRequest) -> tuple[str, str] | None:
        """Create a one-time reset link. Returns ``(email, link)`` to send, or None.

        The caller answers the same way either way, so the response never
        reveals whether an address is registered.
        """
        email = payload.email.strip().lower()
        supabase = (self.supabase_provider or get_supabase)(admin=True)
        if supabase is None:
            raise HTTPException(status_code=503, detail="Service unavailable. Please try again.")
        try:
            result = supabase.table("users").select("id").eq("email", email).limit(1).execute()
        except Exception as err:
            logger.error("Could not look up the reset email: %s", err, exc_info=True)
            raise HTTPException(status_code=503, detail="Service unavailable. Please try again.") from err

        user = result.data[0] if result.data else None
        if not user or not allow_reset_email(email):
            return None

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_LINK_MINUTES)
        try:
            # One live link per user: asking again replaces the older one.
            supabase.table("password_resets").delete().eq("user_id", user["id"]).execute()
            supabase.table("password_resets").insert({
                "user_id": user["id"],
                "token_hash": _token_hash(token),
                "expires_at": expires_at.isoformat(),
            }).execute()
        except Exception as err:
            logger.error("Could not save the password reset: %s", err, exc_info=True)
            return None

        link = f"{get_settings().app_url.rstrip('/')}/reset-password?token={quote(token)}"
        return email, link

    def confirm_password_reset(self, payload: PasswordResetConfirm) -> None:
        """Set a new password if the link is valid, unused and not expired."""
        supabase = (self.supabase_provider or get_supabase)(admin=True)
        if supabase is None:
            raise HTTPException(status_code=503, detail="Service unavailable. Please try again.")
        now = datetime.now(timezone.utc)
        try:
            result = (
                supabase.table("password_resets")
                .select("id,user_id,expires_at,used_at")
                .eq("token_hash", _token_hash(payload.token))
                .limit(1)
                .execute()
            )
            reset = result.data[0] if result.data else None
            if not reset or reset.get("used_at") or datetime.fromisoformat(reset["expires_at"]) <= now:
                raise HTTPException(status_code=400, detail=INVALID_RESET_LINK)

            # Marking it used only while still unused stops two requests from spending one link twice.
            claimed = (
                supabase.table("password_resets")
                .update({"used_at": now.isoformat()})
                .eq("id", reset["id"])
                .is_("used_at", "null")
                .execute()
            )
            if not claimed.data:
                raise HTTPException(status_code=400, detail=INVALID_RESET_LINK)

            supabase.table("users").update(
                {"password": hash_password(payload.new_password)}
            ).eq("id", reset["user_id"]).execute()
            supabase.table("password_resets").delete().eq("user_id", reset["user_id"]).execute()
        except HTTPException:
            raise
        except Exception as err:
            logger.error("Could not reset the password: %s", err, exc_info=True)
            raise HTTPException(status_code=500, detail="Could not update the password. Please try again.") from err
        # shortcut: sessions are stateless, so devices already signed in stay signed in until their
        # token expires (AUTH_TOKEN_TTL_HOURS). Add a password_changed_at check in auth.py to end them.


onboarding_facade = OnboardingFacade()
