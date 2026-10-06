from fastapi import APIRouter, HTTPException

from app.schemas.ai import TrainerInsightRequest, TrainerInsightResponse
from app.services.ai_service import generate_trainer_insight

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
