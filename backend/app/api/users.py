from fastapi import APIRouter

from app.facades.onboarding_facade import onboarding_facade
from app.schemas.user import UserOnboardingRequest, UserOnboardingResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/onboarding", response_model=UserOnboardingResponse)
def submit_onboarding(payload: UserOnboardingRequest) -> UserOnboardingResponse:
    return onboarding_facade.register(payload)
