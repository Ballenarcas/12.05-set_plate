from pydantic import BaseModel, Field


class UserOnboardingRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=15, description="First name")
    surname: str = Field(..., min_length=1, max_length=25, description="Last name")
    email: str = Field(..., min_length=3, max_length=255, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$", description="Email address")
    password: str | None = Field(default=None, min_length=6)
    age: int | None = Field(default=None, ge=12, le=120)
    gender: str | None = None
    weight: float | None = Field(default=None, ge=20.0, le=350.0)
    height: int | None = Field(default=None, ge=80, le=250)
    objective: str | None = None


class UserOnboardingResponse(BaseModel):
    status: str
    user_id: str
    name: str
    surname: str
    email: str
    message: str
    saved_to_supabase: bool


class UserLookupRequest(BaseModel):
    email: str = Field(
        ...,
        min_length=3,
        max_length=255,
        pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$",
        description="Email address",
    )


class UserLookupResponse(BaseModel):
    id: str
    email: str
    name: str
    surname: str
    is_premium: bool | None = None
    age: int | None = None
    gender: str | None = None
    weight: float | None = None
    height: int | None = None
    objective: str | None = None
