from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas.ai import (
    CalorieAdjustmentDecisionRequest,
    CalorieAdjustmentDecisionResponse,
    CalorieAdjustmentResponse,
    ConversationalSetupRequest,
    ConversationalSetupResponse,
    ParseNaturalLanguageRequest,
    ParseNaturalLanguageResponse,
    TrainerInsightRequest,
    TrainerInsightResponse,
)
from app.facades.ai_facade import ai_facade

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/trainer-insight", response_model=TrainerInsightResponse)
def trainer_insight(request: TrainerInsightRequest) -> TrainerInsightResponse:
    try:
        insight = ai_facade.trainer_insight(
            nutrition_summary=request.nutrition_summary,
            training_summary=request.training_summary,
            user_goal=request.user_goal,
        )
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="GroqCloud request failed.") from error

    return TrainerInsightResponse(insight=insight, model="configured")


@router.post("/parse-intent", response_model=ParseNaturalLanguageResponse)
def parse_natural_language(request: ParseNaturalLanguageRequest) -> ParseNaturalLanguageResponse:
    """Fuzzy matches natural language user input against database exercises, routines, foods, and meals."""
    return ai_facade.parse_intent(
        text=request.text,
        threshold=request.threshold,
        limit_per_category=request.limit_per_category,
    )


@router.post("/conversational-setup", response_model=ConversationalSetupResponse)
def conversational_setup(request: ConversationalSetupRequest) -> ConversationalSetupResponse:
    """Talks to the AI bot to set up routines or log meals with grounded DB object recognition."""
    reply, detected_intent, matched_entities = ai_facade.conversational_setup(
        message=request.message,
        conversation_history=request.conversation_history,
    )
    return ConversationalSetupResponse(
        reply=reply,
        detected_intent=detected_intent,
        matched_entities=matched_entities,
    )


@router.get("/calorie-adjustment", response_model=CalorieAdjustmentResponse)
def get_calorie_adjustment(user_id: UUID, today: date | None = None):
    try:
        return ai_facade.calorie_adjustment(user_id=user_id, today=today.isoformat() if today else None)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not build the calorie adjustment.") from error


@router.post("/calorie-adjustment/decision", response_model=CalorieAdjustmentDecisionResponse)
def decide_calorie_adjustment(request: CalorieAdjustmentDecisionRequest):
    try:
        result = ai_facade.decide_calorie_adjustment(
            user_id=UUID(request.user_id),
            adjustment_id=UUID(request.adjustment_id),
            status=request.status,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return CalorieAdjustmentDecisionResponse(
        adjustment_id=str(result["adjustment_id"]),
        status=str(result["status"]),
        calorie_goal=int(result["calorie_goal"]),
    )

