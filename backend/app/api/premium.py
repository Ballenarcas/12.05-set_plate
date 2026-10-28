from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import current_user
from app.schemas.premium import PremiumPurchaseRequest, PremiumPurchaseResponse

router = APIRouter(prefix="/premium", tags=["premium"])


@router.post("/subscribe", response_model=PremiumPurchaseResponse)
def subscribe_to_premium(
    payload: PremiumPurchaseRequest,
    user_id: UUID = Depends(current_user),
) -> PremiumPurchaseResponse:
    # A subscription may only be granted by a verified payment-provider
    # webhook. Until checkout exists, the client cannot upgrade itself.
    _ = (payload, user_id)
    raise HTTPException(status_code=501, detail="Checkout is not available yet.")
