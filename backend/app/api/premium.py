from fastapi import APIRouter, HTTPException, Query

from app.facades.premium_facade import premium_facade
from app.schemas.premium import PremiumPurchaseRequest, PremiumPurchaseResponse

router = APIRouter(prefix="/premium", tags=["premium"])


@router.post("/subscribe", response_model=PremiumPurchaseResponse)
def subscribe_to_premium(
    payload: PremiumPurchaseRequest,
    user_id: str = Query(..., min_length=1, description="ID of the user buying premium"),
) -> PremiumPurchaseResponse:
    try:
        return premium_facade.purchase(user_id, payload.plan)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
