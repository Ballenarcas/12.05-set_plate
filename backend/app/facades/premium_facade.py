from app.schemas.premium import PremiumCancelResponse, PremiumPlan, PremiumPurchaseResponse
from app.services.premium_service import cancel_premium_db, purchase_premium_db


class PremiumFacade:
    def purchase(self, user_id: str, plan: PremiumPlan) -> PremiumPurchaseResponse:
        return purchase_premium_db(user_id, plan)

    def cancel(self, user_id: str) -> PremiumCancelResponse:
        return cancel_premium_db(user_id)


premium_facade = PremiumFacade()
