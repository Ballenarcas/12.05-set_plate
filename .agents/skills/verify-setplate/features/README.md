# SET&PLATE feature map

Primary surface: the React web UI at `http://localhost:5173`. Secondary surface: the FastAPI JSON API at `http://127.0.0.1:8000/api/v1`.

Read `../SKILL.md` first. Every journey uses the bundled Chrome DevTools harness and the account in `.env.verify`.

| Feature | Entry point | Writes | Groq call | Automated today |
| --- | --- | --- | --- | --- |
| [Exercise search](exercise-search.md) | `/workouts/active/exercises` | No | No | Yes, `proof` |
| [Dashboard and daily plan](dashboard.md) | `/` | Plan row only if no plan exists | Yes when it auto-plans | No, guarded |
| [Workout session](workout-session.md) | `/workouts`, `/workouts/active` | `workouts`, `workout_sets` | Only if the AI button is pressed | No, cleanup required |
| [Meal logging](meal-logging.md) | `/log-meals` | `meals` | No | No, cleanup required |
| [Settings and auth](settings-and-auth.md) | `/login`, `/onboarding`, `/settings` | `users` on onboarding or save | No | Login is covered by `proof` |

## Evidence standard

- Drive the real UI and the real backend. No route interception, test-only endpoints, or `localStorage` injection.
- Capture the action and the resulting state. Compare rendered data with the network payload when the feature is data-driven.
- For write journeys, capture the created id and delete the row through the app before cleanup.
- Never call Groq. Skip the AI path and say so in the result.
- Keep artifacts under `../evidence/<UTC timestamp>/`. They survive cleanup.

## Seed data

There is no local seed. The backend reads the 918-exercise catalog from `backend/app/data/exercises_catalog.json` and persists users, routines, meals, and workouts in the shared Supabase project. The verification account supplies the user context. If a journey needs data the account does not have, report the precondition as a failure and add it to that feature's Gotchas instead of weakening the journey.
