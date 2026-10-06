from app.schemas.nutrition import MacroSummary


def get_daily_macros() -> MacroSummary:
    return MacroSummary(protein_grams=45, carbs_grams=120, fat_grams=30, calories_remaining=1420)
