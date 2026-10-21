# Meal logging

## Sub-features

- Daily calorie summary with remaining calories and macro pills.
- Search across today's logged meals.
- `Add Register` modal: food search with suggestions, quantity in grams with quick presets, meal type, add multiple foods to a plate, then Save Meal.
- Today consumption list with a delete action per meal.
- `See all` leads to the Nutrition tab, which is still a placeholder.

## How to get to it (user POV)

1. Sign in.
2. From Home, press `Log a meal`. Or open `/log-meals` directly.
3. Press `Add Register`.
4. Search a food, pick a suggestion, set the quantity and meal type.
5. Press `Save Meal`.

The router keeps `/log-meals` outside `ProtectedLayout`, but the page redirects to `/login` when `getCurrentUser()` is empty.

## Driving it with Chrome DevTools

This journey writes a row. Delete it before cleanup.

1. Open `/log-meals` and wait for the `Daily Calorie Summary` section.
2. Press `button.btn-add-register` with text `Add Register`.
3. In the dialog `role="dialog"` with `aria-labelledby="modal-meal-title"`, type into the food field with placeholder `e.g. Chicken breast, rice...`.
4. Pick a suggestion row, or press `Add food to this meal`.
5. Set a small quantity (for example `1` gram) so the macro change is easy to verify.
6. Choose a meal type and press the submit button with text `Save Meal`.
7. Capture the `POST /api/v1/nutrition/meals` response `id` from the network log.
8. Assert the meal appears under `Today consumption` with the expected name.
9. Press `button[aria-label="Delete <meal name>"]` and confirm the row disappears, or call `DELETE /api/v1/nutrition/meals/<id>`.

## Gotchas

- The Nutrition dock tab is a placeholder screen. Log meals through `/log-meals`, not through Nutrition.
- Meals are stored per user. The verification account's list mixes with any real meals it already has. Filter your search assertion by the name you created.
- The modal closes when the backdrop is clicked. Use the modal's own buttons.
- Deleting goes through the UI trash button or the API. There is no bulk clear, so delete every row the run created.
- Calorie math depends on the food database entry. Assert the meal presence and the created id, not exact macros, unless the entry is fixed.
