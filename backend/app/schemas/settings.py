from pydantic import BaseModel, Field

class UserSettingsUpdate(BaseModel):
    # Personal Info 
    age: int = Field(..., ge=12, le=120, description="Age must not be empty and greater than 0")
    weight: float = Field(..., ge=20.0, le=350.0, description="Weight must not be empty and greater than 0")
    height: int = Field(..., ge=80, le=250, description="Height must not be empty and greater than 0")
    gender: str = Field(
        ..., 
        min_length=1,
        max_length=30,
        description="Gender must not be empty (required for metabolism calculations)"
    )
    objective: str = Field(..., min_length=1, max_length=50, description="Objective must not be empty")
    
    # Permissions 
    notifications_enabled: bool = Field(
        default=False, 
        description="Permission to receive notifications"
    )
    health_data_integration: bool = Field(
        default=False, 
        description="Health providers integrations (e.g., Apple Health)"
    )