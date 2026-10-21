from app.services.nutrition_math import (
    compute_macro_targets,
    estimate_burned_kcal,
)


def test_estimate_burned_uses_met_times_weight_times_hours():
    assert estimate_burned_kcal(75, 3600) == 375


def test_estimate_burned_zero_without_weight_or_duration():
    assert estimate_burned_kcal(None, 3600) == 0
    assert estimate_burned_kcal(0, 3600) == 0
    assert estimate_burned_kcal(75, 0) == 0
    assert estimate_burned_kcal(75, -10) == 0


def test_macro_targets_follow_dashboard_rules():
    protein, fat, carbs = compute_macro_targets(2200, 75)
    assert protein == 120.0
    assert fat == 61.1
    assert carbs == 292.5


def test_macro_targets_never_negative_when_budget_is_small():
    protein, fat, carbs = compute_macro_targets(100, 80)
    assert protein == 128.0
    assert fat == 2.8
    assert carbs == 0.0


def test_macro_targets_fall_back_to_reference_weight():
    protein, _, _ = compute_macro_targets(2200, None)
    assert protein == 120.0
