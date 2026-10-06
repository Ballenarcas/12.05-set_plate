from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class TrainerInsightRequest(BaseModel):
    nutrition_summary: str = Field(min_length=1, max_length=4000)
    training_summary: str = Field(min_length=1, max_length=4000)
    user_goal: str = Field(min_length=1, max_length=500)


class TrainerInsightResponse(BaseModel):
    insight: str
    model: str


class EntityType(str, Enum):
    FOOD = "food"
    EXERCISE = "exercise"
    ROUTINE = "routine"
    MEAL = "meal"


class MatchedEntity(BaseModel):
    id: str
    name: str
    category: EntityType
    score: float = Field(ge=0.0, le=1.0)
    matched_term: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ParseNaturalLanguageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    threshold: float = Field(default=0.65, ge=0.0, le=1.0)
    limit_per_category: int = Field(default=5, ge=1, le=20)


class ParseNaturalLanguageResponse(BaseModel):
    original_text: str
    detected_intent: str = "general"
    foods: list[MatchedEntity] = Field(default_factory=list)
    exercises: list[MatchedEntity] = Field(default_factory=list)
    routines: list[MatchedEntity] = Field(default_factory=list)
    meals: list[MatchedEntity] = Field(default_factory=list)


class ConversationalSetupRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_history: list[dict[str, str]] = Field(default_factory=list)


class ConversationalSetupResponse(BaseModel):
    reply: str
    detected_intent: str
    matched_entities: ParseNaturalLanguageResponse

