from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import current_user
from app.facades.premium_facade import premium_facade
from app.schemas.premium import PremiumCancelResponse, PremiumPurchaseRequest, PremiumPurchaseResponse

router = APIRouter(prefix="/premium", tags=["premium"])


@router.post("/subscribe", response_model=PremiumPurchaseResponse)
def subscribe_to_premium(
    payload: PremiumPurchaseRequest,
    user_id: UUID = Depends(current_user),
) -> PremiumPurchaseResponse:
    # Mock checkout: no payment is processed, so the authenticated caller is
    # trusted to activate its own subscription. Replace with a provider webhook
    # before charging real money.
    try:
        return premium_facade.purchase(str(user_id), payload.plan)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err


@router.post("/cancel", response_model=PremiumCancelResponse)
def cancel_premium(user_id: UUID = Depends(current_user)) -> PremiumCancelResponse:
    try:
        return premium_facade.cancel(str(user_id))
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except RuntimeError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
