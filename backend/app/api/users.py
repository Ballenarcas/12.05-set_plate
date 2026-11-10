from fastapi import APIRouter, BackgroundTasks

from app.facades.onboarding_facade import onboarding_facade
from app.services.email_service import send_password_reset_email
from app.schemas.user import (
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetResponse,
    UserLoginRequest,
    UserLoginResponse,
    UserOnboardingRequest,
    UserOnboardingResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/login", response_model=UserLoginResponse)
def login_user(payload: UserLoginRequest) -> UserLoginResponse:
    return onboarding_facade.login(payload)


@router.post("/password-reset/request", response_model=PasswordResetResponse)
def request_password_reset(payload: PasswordResetRequest, background_tasks: BackgroundTasks) -> PasswordResetResponse:
    reset = onboarding_facade.request_password_reset(payload)
    if reset:
        # Sent after the response, so its timing doesn't reveal that the account exists.
        background_tasks.add_task(send_password_reset_email, *reset)
    return PasswordResetResponse(message="If an account exists for that email, we sent a reset link.")


@router.post("/password-reset/confirm", response_model=PasswordResetResponse)
def confirm_password_reset(payload: PasswordResetConfirm) -> PasswordResetResponse:
    onboarding_facade.confirm_password_reset(payload)
    return PasswordResetResponse(message="Password updated. Sign in with your new password.")


@router.post("/onboarding", response_model=UserOnboardingResponse)
def submit_onboarding(payload: UserOnboardingRequest) -> UserOnboardingResponse:
    return onboarding_facade.register(payload)
