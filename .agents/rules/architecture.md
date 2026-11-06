# Architecture & Domain Boundary Rules

SET&PLATE integrates fitness and nutrition tracking with an optional AI Trainer.

---

## 1. Domain Separation
1. **Nutrition Domain**:
   - Manages food logs, macronutrients (protein, carbs, fat), calories, and plate scans.
   - Schemas: `backend/app/schemas/nutrition.py`
   - Services: `backend/app/services/nutrition_service.py`
   - Frontend views: `frontend/src/pages/Nutrition.tsx`

2. **Workout Domain**:
   - Manages workout routines, exercise sets, reps, volume, and completion status.
   - Schemas: `backend/app/schemas/workout.py`
   - Services: `backend/app/services/workout_service.py`
   - Frontend views: `frontend/src/pages/Workouts.tsx`

3. **AI Trainer Domain**:
   - Correlates training strain with nutritional intake and recovery.
   - Generates contextual tips, adjusts recommended calories or workout intensity.
   - Schemas: `backend/app/schemas/ai.py`
   - Services: `backend/app/services/ai_service.py`
   - API endpoint: `backend/app/api/ai.py`

   **AI Tips (Home):** active feature, not a placeholder. `backend/app/services/ai_tips_service.py` picks each tip by rules; `backend/app/api/ai.py` serves `GET /ai/tips/current` and `POST /ai/tips/{id}/decision`; the UI is `frontend/src/components/home/AiTipCard.tsx`. Tips never diagnose or treat conditions, never recommend a deficit above 500 kcal/day, and never raise workout load more than 10% per week. A model may personalize tips only for Premium users when `AI_TIPS_MODEL_ENABLED` is on, once per change in the user's data and at most 8 times per user per day; it never chooses actions or invents numbers, and `is_safe_wording` must stay the gate for its output. Every tip must tell the user what to do: an Accept action, or a rule-written `next_step` that the model cannot change. Accepted tips feed later tips and the workout planner, which reads only rule-written notes and must keep its recovery filter.

## 2. Cross-Cutting Concerns
- **Supabase Integration**: Centralized client in `backend/app/db/supabase_client.py`. Do not re-instantiate clients across endpoints.
- **Environment Settings**: Handled exclusively through `backend/app/core/config.py` using `pydantic-settings`.
- **API Client**: Frontend requests must flow through `frontend/src/services/api.ts` to maintain centralized error handling and URL configuration.
- **Use-case orchestration**: Routers should call `backend/app/facades/`; facades coordinate services and persistence. Keep service modules focused on subsystem logic.
