import logging
import uuid

from fastapi import HTTPException

from app.db.supabase_client import get_supabase
from app.schemas.user import UserOnboardingRequest, UserOnboardingResponse

logger = logging.getLogger(__name__)


class OnboardingFacade:
    def __init__(self, supabase_provider=get_supabase):
        self.supabase_provider = supabase_provider

    def register(self, payload: UserOnboardingRequest) -> UserOnboardingResponse:
        user_id = str(uuid.uuid4())
        try:
            supabase = self.supabase_provider(admin=True)
            if supabase is None:
                raise HTTPException(status_code=500, detail="Database client is not configured. Please ensure SUPABASE_URL and SUPABASE_KEY are set.")
            record = {
                "id": user_id, "email": payload.email, "is_premium": False,
                "Name": payload.name, "Surname": payload.surname,
                "weight": float(payload.weight) if payload.weight is not None else None,
                "height": int(payload.height) if payload.height is not None else None,
                "age": int(payload.age) if payload.age is not None else None,
                "gender": payload.gender, "objective": payload.objective,
            }
            result = supabase.table("users").upsert(record, on_conflict="email").execute()
            if result.data:
                user_id = result.data[0].get("id", user_id)
        except HTTPException:
            raise
        except Exception as err:
            logger.error("Could not persist user to Supabase: %s", err, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to save user in database: {err}") from err
        return UserOnboardingResponse(status="success", user_id=user_id, name=payload.name,
            surname=payload.surname, email=payload.email,
            message=f"Welcome to SET&PLATE, {payload.name}!", saved_to_supabase=True)


onboarding_facade = OnboardingFacade()
