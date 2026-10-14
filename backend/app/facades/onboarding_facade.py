import logging
import uuid

from fastapi import HTTPException

from app.core.security import hash_password
from app.db.supabase_client import get_supabase
from app.schemas.user import UserOnboardingRequest, UserOnboardingResponse

logger = logging.getLogger(__name__)


def calculate_calorie_goal(
    weight: float | None,
    height: int | None,
    age: int | None,
    gender: str | None,
    objective: str | None,
) -> int:
    """Calculates scientifically tailored daily calorie goal based on Mifflin-St Jeor formula."""
    w = weight if weight and weight > 0 else 75.0
    h = height if height and height > 0 else 175.0
    a = age if age and age > 0 else 25
    g = (gender or "male").lower()

    # Mifflin-St Jeor BMR
    gender_offset = 5 if "male" in g else (-161 if "female" in g else -78)
    bmr = (10.0 * w) + (6.25 * h) - (5.0 * a) + gender_offset

    # TDEE activity baseline (light/moderate training: 1.25x)
    tdee = bmr * 1.25

    # Fitness objective calibration
    obj = (objective or "").lower()
    if "lose" in obj:
        target = tdee - 500
    elif "hypertrophy" in obj:
        target = tdee + 400
    elif "strength" in obj:
        target = tdee + 250
    else:
        target = tdee

    return max(1200, min(5000, round(target)))


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


onboarding_facade = OnboardingFacade()
