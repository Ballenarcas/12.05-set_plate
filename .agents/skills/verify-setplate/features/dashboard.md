# Dashboard and daily plan

## Sub-features

- Greeting with the user's name and the formatted current date.
- Trainer tip card. The text comes from the dashboard summary; it is a static placeholder, not a live model call.
- Nutrition summary with calories remaining, a progress bar, protein, carbs, and fat, plus a `Log a meal` action.
- Programmed training card: a rest day, a saved routine plan, or an AI-generated plan. It shows the planned exercises with sets and reps and starts the session.
- Completed-workout state replaces the plan card after a workout is saved today.

## How to get to it (user POV)

Sign in and land on `/`. Home is the first item in the bottom dock (`nav[aria-label="Primary navigation"] button[aria-label="Home"]`).

## Driving it with Chrome DevTools

Read the doctor output first:

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-setplate/scripts/doctor.ps1
```

- `home_safe: true` means `has_plan_today` or `completed_workout_today` is set. Navigating `/` will not create a plan.
- `home_safe: false` means the dashboard has no plan and no completed workout today. Home will call `POST /api/v1/workouts/plan-today`, which calls Groq. Do not drive `/` until a plan exists or AI spending is explicitly allowed.

When safe, log in, navigate `/`, and wait for `h1` containing `Hello,`. Assert:

- `section[aria-labelledby="nutrition-summary"]` shows the calorie progress bar.
- `section[aria-labelledby="programmed-training"]` shows either `Rest day`, the plan title, or `Workout completed today`.
- If a plan is present, `ul.scheduled-exercises` lists at least one exercise with `N sets · M reps`.

## Gotchas

- Home auto-plans once per day when `plan` is null and no workout is completed today. A fresh or reset account triggers Groq. The proof avoids Home for this reason.
- The dashboard summary is cached in `sessionStorage` for 30 seconds under `set_plate_dashboard:<user_id>`. A forced refresh bypasses it.
- The trainer tip is static. Do not report an AI latency or model issue from it.
- A rest day is a valid plan. Do not treat the missing exercise list as a failure.
- The plan title can be a routine name, an AI title, or `Rest day`. Match the section, not the title.
