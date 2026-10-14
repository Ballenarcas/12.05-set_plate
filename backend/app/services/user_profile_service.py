def calculate_calorie_goal(
    weight: float | None,
    height: int | None,
    age: int | None,
    gender: str | None,
    objective: str | None,
) -> int:
    """Calculate a daily calorie target using Mifflin-St Jeor and the goal."""
    w = weight if weight and weight > 0 else 75.0
    h = height if height and height > 0 else 175.0
    a = age if age and age > 0 else 25
    g = (gender or "male").lower()
    gender_offset = 5 if "male" in g else (-161 if "female" in g else -78)
    bmr = (10.0 * w) + (6.25 * h) - (5.0 * a) + gender_offset
    tdee = bmr * 1.25

    obj = (objective or "").lower()
    if "lose" in obj:
        target = tdee - 500
    elif "hypertrophy" in obj:
        target = tdee + 400
    elif "strength" in obj:
        target = tdee + 250
    else:
        target = tdee

    return max(1200, min(5000, round(target)))
