from fastapi import APIRouter, HTTPException

from app.schemas.ai import (
    ConversationalSetupRequest,
    ConversationalSetupResponse,
    ParseNaturalLanguageRequest,
    ParseNaturalLanguageResponse,
    TrainerInsightRequest,
    TrainerInsightResponse,
)
from app.services.ai_service import generate_trainer_insight, handle_conversational_setup
from app.services.fuzzy_matcher import get_fuzzy_matcher

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/trainer-insight", response_model=TrainerInsightResponse)
def trainer_insight(request: TrainerInsightRequest) -> TrainerInsightResponse:
    try:
        insight = generate_trainer_insight(
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
    matcher = get_fuzzy_matcher()
    return matcher.match(
        text=request.text,
        threshold=request.threshold,
        limit_per_category=request.limit_per_category,
    )


@router.post("/conversational-setup", response_model=ConversationalSetupResponse)
def conversational_setup(request: ConversationalSetupRequest) -> ConversationalSetupResponse:
    """Talks to the AI bot to set up routines or log meals with grounded DB object recognition."""
    reply, detected_intent, matched_entities = handle_conversational_setup(
        message=request.message,
        conversation_history=request.conversation_history,
    )
    return ConversationalSetupResponse(
        reply=reply,
        detected_intent=detected_intent,
        matched_entities=matched_entities,
    )

