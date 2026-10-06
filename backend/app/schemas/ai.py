from pydantic import BaseModel, Field


class TrainerInsightRequest(BaseModel):
    nutrition_summary: str = Field(min_length=1, max_length=4000)
    training_summary: str = Field(min_length=1, max_length=4000)
    user_goal: str = Field(min_length=1, max_length=500)


class TrainerInsightResponse(BaseModel):
    insight: str
    model: str
