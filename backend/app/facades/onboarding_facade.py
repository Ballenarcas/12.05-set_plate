import logging
import uuid

from fastapi import HTTPException

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


class OnboardingFacade:
    def __init__(self, supabase_provider=None):
        self.supabase_provider = supabase_provider

    def register(self, payload: UserOnboardingRequest) -> UserOnboardingResponse:
        provider = self.supabase_provider or get_supabase
        user_id = str(uuid.uuid4())
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
            record = {
                "id": user_id, "email": payload.email, "is_premium": False,
                "Name": payload.name, "Surname": payload.surname,
                "weight": float(payload.weight) if payload.weight is not None else None,
                "height": int(payload.height) if payload.height is not None else None,
                "age": int(payload.age) if payload.age is not None else None,
                "gender": payload.gender, "objective": payload.objective,
                "calorie_goal": calorie_goal,
            }
            # Onboarding upserts on email, so a repeat signup would otherwise
            # overwrite the password of an existing account without proving
            # ownership of that email. Only set it when the email is new.
            if payload.password:
                existing = (
                    supabase.table("users")
                    .select("id")
                    .eq("email", payload.email)
                    .limit(1)
                    .execute()
                )
                if not existing.data:
                    record["password"] = hash_password(payload.password)
                else:
                    logger.info("Email already registered; keeping the stored password untouched.")
            result = supabase.table("users").upsert(record, on_conflict="email").execute()
            saved_id = result.data[0].get("id") if result.data else None
            if saved_id:
                user_id = saved_id
            else:
                saved_user = (
                    supabase.table("users")
                    .select("id")
                    .eq("email", payload.email)
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
            raise HTTPException(status_code=500, detail=f"Failed to save user in database: {err}") from err
        return UserOnboardingResponse(status="success", user_id=user_id, name=payload.name,
            surname=payload.surname, email=payload.email, calorie_goal=calorie_goal,
            message=f"Welcome to SET&PLATE, {payload.name}!", saved_to_supabase=True)

    def login(self, payload: UserLoginRequest) -> UserLoginResponse:
        """Authenticate a user and return only public profile fields."""
        try:
            supabase = (self.supabase_provider or get_supabase)(admin=True)
            if supabase is None:
                raise HTTPException(
                    status_code=500,
                    detail="Database client is not configured. Please ensure SUPABASE_URL and SUPABASE_KEY are set.",
                )
            email_pattern = (
                payload.email.strip()
                .replace("\\", "\\\\")
                .replace("%", r"\%")
                .replace("_", r"\_")
            )
            result = (
                supabase.table("users")
                .select("id,email,password,Name,Surname,is_premium,age,gender,weight,height,objective")
                .ilike("email", email_pattern)
                .limit(1)
                .execute()
            )
        except HTTPException:
            raise
        except Exception as err:
            logger.error("Could not authenticate user: %s", err, exc_info=True)
            raise HTTPException(status_code=500, detail="Could not sign in") from err

        user = result.data[0] if result.data else None
        if user is None or not verify_password(payload.password, user.get("password", "")):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        return UserLoginResponse(
            id=str(user["id"]),
            email=user["email"],
            name=user.get("Name") or "",
            surname=user.get("Surname") or "",
            is_premium=user.get("is_premium"),
            age=user.get("age"),
            gender=user.get("gender"),
            weight=user.get("weight"),
            height=user.get("height"),
            objective=user.get("objective"),
        )


onboarding_facade = OnboardingFacade()
