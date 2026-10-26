from datetime import datetime
from typing import Literal

from pydantic import BaseModel

PremiumPlan = Literal["annual", "monthly"]


class PremiumPurchaseRequest(BaseModel):
    plan: PremiumPlan


class PremiumPurchaseResponse(BaseModel):
    status: str
    is_premium: bool
    plan: PremiumPlan
    started_at: datetime
    expires_at: datetime
