# Workout session

## Sub-features

- Saved routine list with exercise previews and estimated duration.
- Start a routine, start an empty workout, or start from the dashboard plan.
- Log weight, reps, and RPE per set, toggle a set complete, add or delete a set with an 8-second undo, and delete with confirmation.
- Per-exercise rest timer, set-type selector, and an exercise menu to replace or remove the exercise.
- Add or replace an exercise through the search page.
- AI adjustment dialog next to Finish. It calls Groq, shows suggestions, accepts one or all, and offers undo.
- Finish dialog with a workout name, Save workout, Discard workout, and Keep training.

## How to get to it (user POV)

1. Sign in and open Workouts in the dock.
2. Press START WORKOUT on a routine, or Start empty workout.
3. Add exercises and log sets.
4. Press Finish, name the workout, then SAVE WORKOUT.

The dashboard plan card also starts a session. The direct route is `/workouts/active`, but it needs router state or a saved `set_plate_active_workout` in `sessionStorage`.

## Driving it with Chrome DevTools

This journey writes rows. Plan the cleanup before starting.

1. Open `/workouts` and assert the routine cards or the `No saved routines yet.` state.
2. Press `button.secondary-action` with text `Start empty workout`, or a routine's `START WORKOUT`.
3. On `/workouts/active`, press `button.secondary-action` with text `Add Set`, or use the existing sets.
4. Fill `input[aria-label="<exercise> set 1 weight"]` and `input[aria-label="<exercise> set 1 reps"]`.
5. Toggle `button[aria-label="Toggle set 1"]`. Assert `aria-pressed` becomes `true` and the rest timer starts.
6. Press `button.finish-button`. The dialog `role="dialog"` with `aria-labelledby="finish-title"` opens.
7. Fill `#completed-workout-name` with a name that starts with `Verification`.
8. Press `SAVE WORKOUT`. Capture the `POST /api/v1/workouts/logs` response `id` from the network log.
9. Delete the created workout with `DELETE /api/v1/workouts/history/<id>?user_id=<id>` or the delete action on `/workouts` history. Record the deletion in `result.json`.

Never press `button[aria-label="Ask AI for adjustments"]`. It calls Groq and has a 60-second per-user cooldown.

## Gotchas

- The active session persists in `sessionStorage` under `set_plate_active_workout`. A leftover session triggers the `Discard ongoing workout?` dialog on Workouts.
- `/workouts/active` without router state or a saved session renders an empty log screen. Use the Workouts entry point.
- Weight and reps are controlled numeric inputs. Set them with the native value setter and dispatch `input`, as `drive.mjs` does.
- Saving writes every set in the payload, including uncompleted ones, depending on backend validation. Finish with at least one completed set to keep the evidence meaningful.
- The AI dialog is excluded from this journey. If a change touches it, verify it only when the user explicitly allows a model call.
- Deleting history needs both the workout id and the same `user_id` that owns it.
