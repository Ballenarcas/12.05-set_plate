"""Pure calculations for the daily nutrition balance. No database access."""

WORKOUT_METS = 5.0
PROTEIN_GRAMS_PER_KG = 1.6
FAT_CALORIE_SHARE = 0.25


def estimate_burned_kcal(weight_kg: float | None, duration_seconds: int) -> int:
    """Deterministic estimate (MET * 3.5 * kg * hours is too aggressive for lifting
    sessions with rests; MET 5.0 over total session duration is the compromise)."""
    if weight_kg is None or weight_kg <= 0:
        return 0
    if duration_seconds <= 0:
        return 0
    hours = duration_seconds / 3600
    return round(WORKOUT_METS * float(weight_kg) * hours)


def compute_macro_targets(adjusted_calories: int, weight_kg: float | None) -> tuple[float, float, float]:
    """Returns (protein_g, fat_g, carbs_g) targets for the adjusted calorie budget."""
    weight = weight_kg if weight_kg and weight_kg > 0 else 75.0
    budget = max(0, adjusted_calories)
    protein = round(PROTEIN_GRAMS_PER_KG * weight, 1)
    fat = round(FAT_CALORIE_SHARE * budget / 9, 1)
    carbs = round(max(0.0, (budget - protein * 4 - fat * 9) / 4), 1)
    return protein, fat, carbs
