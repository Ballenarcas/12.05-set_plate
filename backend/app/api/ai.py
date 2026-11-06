from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.ai_quota import use_ai_call
from app.core.auth import current_user
from app.core.local_day import LocalDay, local_day
from app.schemas.ai import (
    AiTipDecisionRequest,
    AiTipDecisionResponse,
    AiTipResponse,
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
def trainer_insight(
    request: TrainerInsightRequest,
    user_id: UUID = Depends(current_user),
) -> TrainerInsightResponse:
    use_ai_call(user_id)
    try:
        insight = ai_facade.trainer_insight(
            nutrition_summary=request.nutrition_summary,
            training_summary=request.training_summary,
            user_goal=request.user_goal,
        )
    except ValueError as error:
        raise HTTPException(status_code=503, detail="The AI trainer is not available right now.") from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="The AI trainer could not answer. Please try again.") from error

    return TrainerInsightResponse(insight=insight, model="configured")


@router.post("/parse-intent", response_model=ParseNaturalLanguageResponse)
def parse_natural_language(
    request: ParseNaturalLanguageRequest,
    user_id: UUID = Depends(current_user),
) -> ParseNaturalLanguageResponse:
    """Fuzzy matches natural language user input against database exercises, routines, foods, and meals."""
    return ai_facade.parse_intent(
        text=request.text,
        threshold=request.threshold,
        limit_per_category=request.limit_per_category,
    )


@router.post("/conversational-setup", response_model=ConversationalSetupResponse)
def conversational_setup(
    request: ConversationalSetupRequest,
    user_id: UUID = Depends(current_user),
) -> ConversationalSetupResponse:
    """Talks to the AI bot to set up routines or log meals with grounded DB object recognition."""
    use_ai_call(user_id)
    reply, detected_intent, matched_entities = ai_facade.conversational_setup(
        message=request.message,
        conversation_history=[message.model_dump() for message in request.conversation_history],
    )
    return ConversationalSetupResponse(
        reply=reply,
        detected_intent=detected_intent,
        matched_entities=matched_entities,
    )


@router.get("/calorie-adjustment", response_model=CalorieAdjustmentResponse)
def get_calorie_adjustment(
    user_id: UUID = Depends(current_user),
    today: date | None = None,
):
    try:
        return ai_facade.calorie_adjustment(user_id=user_id, today=today.isoformat() if today else None)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail="Could not build the calorie adjustment.") from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not build the calorie adjustment.") from error


@router.post("/calorie-adjustment/decision", response_model=CalorieAdjustmentDecisionResponse)
def decide_calorie_adjustment(
    request: CalorieAdjustmentDecisionRequest,
    user_id: UUID = Depends(current_user),
):
    try:
        result = ai_facade.decide_calorie_adjustment(
            user_id=user_id,
            adjustment_id=UUID(request.adjustment_id),
            status=request.status,
        )
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail="Could not apply the calorie adjustment.") from error
    return CalorieAdjustmentDecisionResponse(
        adjustment_id=str(result["adjustment_id"]),
        status=str(result["status"]),
        calorie_goal=int(result["calorie_goal"]),
    )


@router.get("/tips/current", response_model=AiTipResponse)
def get_current_tip(user_id: UUID = Depends(current_user), day: LocalDay = Depends(local_day)):
    try:
        return AiTipResponse(tip=ai_facade.current_tip(user_id=user_id, day=day))
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not build the tip.") from error


@router.post("/tips/{tip_id}/decision", response_model=AiTipDecisionResponse)
def decide_tip(
    tip_id: UUID,
    request: AiTipDecisionRequest,
    user_id: UUID = Depends(current_user),
    day: LocalDay = Depends(local_day),
):
    try:
        return AiTipDecisionResponse(**ai_facade.decide_tip(user_id=user_id, tip_id=tip_id, status=request.status, day=day))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not update the tip.") from error


@router.post("/tips/{tip_id}/undo", response_model=AiTipDecisionResponse)
def undo_tip(tip_id: UUID, user_id: UUID = Depends(current_user), day: LocalDay = Depends(local_day)):
    try:
        return AiTipDecisionResponse(**ai_facade.undo_tip(user_id=user_id, tip_id=tip_id, day=day))
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail="Could not undo the tip.") from error
