import logging
import uuid
from fastapi import APIRouter, HTTPException

from app.db.supabase_client import get_supabase
from app.schemas.user import UserOnboardingRequest, UserOnboardingResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/onboarding", response_model=UserOnboardingResponse)
def submit_onboarding(payload: UserOnboardingRequest) -> UserOnboardingResponse:
    """Stores user onboarding profile into public.users in Supabase."""
    user_id = str(uuid.uuid4())
    saved_to_supabase = False

    try:
        supabase = get_supabase(admin=True)
        if supabase:
            record = {
                "id": user_id,
                "email": payload.email,
                "is_premium": False,
                "Name": payload.name,
                "Surname": payload.surname,
                "weight": float(payload.weight) if payload.weight is not None else None,
                "height": int(payload.height) if payload.height is not None else None,
                "age": int(payload.age) if payload.age is not None else None,
                "gender": payload.gender,
                "objective": payload.objective,
            }
            res = (
                supabase.table("users")
                .upsert(record, on_conflict="email")
                .execute()
            )
            if res.data and len(res.data) > 0:
                user_id = res.data[0].get("id", user_id)
            saved_to_supabase = True
        else:
            logger.error("Supabase client is None. Check .env configuration.")
    except Exception as err:
        logger.error(f"Could not persist user to Supabase: {err}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save user in database: {str(err)}",
        )

    if not saved_to_supabase:
        raise HTTPException(
            status_code=500,
            detail="Database client is not configured. Please ensure SUPABASE_URL and SUPABASE_KEY are set.",
        )

    return UserOnboardingResponse(
        status="success",
        user_id=user_id,
        name=payload.name,
        surname=payload.surname,
        email=payload.email,
        message=f"Welcome to SET&PLATE, {payload.name}!",
        saved_to_supabase=saved_to_supabase,
    )
