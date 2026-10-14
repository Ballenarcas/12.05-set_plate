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

   **Current availability:** AI model calls are temporarily disabled to conserve tokens. Keep the Home tip as a static placeholder; do not call or re-enable a model until the user explicitly asks.

## 2. Cross-Cutting Concerns
- **Supabase Integration**: Centralized client in `backend/app/db/supabase_client.py`. Do not re-instantiate clients across endpoints.
- **Environment Settings**: Handled exclusively through `backend/app/core/config.py` using `pydantic-settings`.
- **API Client**: Frontend requests must flow through `frontend/src/services/api.ts` to maintain centralized error handling and URL configuration.
- **Use-case orchestration**: Routers should call `backend/app/facades/`; facades coordinate services and persistence. Keep service modules focused on subsystem logic.
