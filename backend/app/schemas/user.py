from pydantic import BaseModel, Field


class UserOnboardingRequest(BaseModel):
    name: str = Field(..., min_length=1, description="First name")
    surname: str = Field(default="", description="Last name")
    email: str = Field(..., min_length=3, description="Email address")
    password: str | None = None
    age: int | None = Field(default=None, ge=1, le=120)
    gender: str | None = None
    weight: float | None = Field(default=None, ge=20.0, le=400.0)
    height: int | None = Field(default=None, ge=50, le=280)
    objective: str | None = None


class UserOnboardingResponse(BaseModel):
    status: str
    user_id: str
    name: str
    surname: str
    email: str
    message: str
    saved_to_supabase: bool
