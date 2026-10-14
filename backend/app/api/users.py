import logging

from fastapi import APIRouter, HTTPException

from app.core.security import verify_password
from app.db.supabase_client import get_supabase
from app.facades.onboarding_facade import onboarding_facade
from app.schemas.user import (
    UserLoginRequest,
    UserLoginResponse,
    UserOnboardingRequest,
    UserOnboardingResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/login", response_model=UserLoginResponse)
def login_user(payload: UserLoginRequest) -> UserLoginResponse:
    """Verifies the supplied password against the saved password hash."""
    try:
        supabase = get_supabase(admin=True)
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

    if not result.data or not verify_password(payload.password, result.data[0].get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = result.data[0]
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


@router.post("/onboarding", response_model=UserOnboardingResponse)
def submit_onboarding(payload: UserOnboardingRequest) -> UserOnboardingResponse:
    return onboarding_facade.register(payload)
