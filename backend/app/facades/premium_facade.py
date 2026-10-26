from app.schemas.premium import PremiumPlan, PremiumPurchaseResponse
from app.services.premium_service import purchase_premium_db


class PremiumFacade:
    def purchase(self, user_id: str, plan: PremiumPlan) -> PremiumPurchaseResponse:
        return purchase_premium_db(user_id, plan)


premium_facade = PremiumFacade()
