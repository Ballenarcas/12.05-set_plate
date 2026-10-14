from fastapi import APIRouter

from app.facades.onboarding_facade import onboarding_facade
from app.schemas.user import (
    UserLoginRequest,
    UserLoginResponse,
    UserOnboardingRequest,
    UserOnboardingResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/login", response_model=UserLoginResponse)
def login_user(payload: UserLoginRequest) -> UserLoginResponse:
    return onboarding_facade.login(payload)


@router.post("/onboarding", response_model=UserOnboardingResponse)
def submit_onboarding(payload: UserOnboardingRequest) -> UserOnboardingResponse:
    return onboarding_facade.register(payload)
