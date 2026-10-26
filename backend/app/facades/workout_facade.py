from uuid import UUID

from app.schemas.workout import RoutineCreate, RoutineSummary
from app.schemas.workout_log import WorkoutHistoryResponse, WorkoutLogCreate, WorkoutLogResponse, WorkoutLogUpdate
from app.schemas.workout_statistics import WorkoutStatisticsRange, WorkoutStatisticsResponse
from app.db.supabase_client import get_supabase
from app.services import workout_service, workout_statistics_service, wger_importer
from app.services.workout_adjustment_service import plan_daily_workout, suggest_live_adjustment
from app.schemas.workout import (
    LiveWorkoutAdjustmentRequest,
    LiveWorkoutAdjustmentSuggestion,
)
from fastapi import HTTPException


class WorkoutFacade:
    async def plan_today(self, user_id: UUID):
        supabase = get_supabase(admin=True)
        if supabase is None:
            raise HTTPException(status_code=503, detail="Supabase is not configured")
        return await plan_daily_workout(user_id, supabase)

    async def suggest_adjustment(self, payload: LiveWorkoutAdjustmentRequest) -> list[LiveWorkoutAdjustmentSuggestion]:
        return await suggest_live_adjustment(payload.model_dump(mode="json"))

    def save_log(self, user_id: UUID, payload: WorkoutLogCreate) -> WorkoutLogResponse:
        return workout_service.save_workout_log(user_id, payload)

    def list_history(self, user_id: UUID, limit: int = 30) -> WorkoutHistoryResponse:
        return workout_service.list_workout_history(user_id, limit)

    def get_statistics(
        self,
        user_id: UUID,
        range_key: WorkoutStatisticsRange,
        timezone_offset_minutes: int = 0,
    ) -> WorkoutStatisticsResponse:
        return workout_statistics_service.get_workout_statistics(
            user_id, range_key, timezone_offset_minutes
        )

    def update_history_entry(
        self,
        user_id: UUID,
        workout_id: UUID,
        payload: WorkoutLogUpdate,
    ) -> WorkoutLogResponse:
        return workout_service.update_workout_history_entry(user_id, workout_id, payload)

    def delete_history_entry(self, user_id: UUID, workout_id: UUID) -> None:
        workout_service.delete_workout_history_entry(user_id, workout_id)

    def list_routines(self, user_id: UUID) -> list[RoutineSummary]:
        return workout_service.list_user_routines(user_id)

    def create_routine(self, user_id: UUID, payload: RoutineCreate) -> RoutineSummary:
        return workout_service.create_user_routine(user_id, payload)

    def update_routine(self, user_id: UUID, routine_id: UUID, payload: RoutineCreate) -> RoutineSummary:
        return workout_service.update_user_routine(user_id, routine_id, payload)

    def delete_routine(self, user_id: UUID, routine_id: UUID) -> None:
        workout_service.delete_user_routine(user_id, routine_id)

    def programmed_workout(self):
        return workout_service.get_programmed_workout()

    def list_exercises(self, **filters):
        return workout_service.list_exercises(**filters)

    def get_exercise_categories(self):
        return workout_service.get_exercise_categories()

    def get_exercise_muscle_groups(self):
        return workout_service.get_exercise_muscle_groups()

    def get_exercise_by_id(self, exercise_id: str):
        return workout_service.get_exercise_by_id(exercise_id)

    def import_wger(self, **options):
        return wger_importer.run_import(**options)


workout_facade = WorkoutFacade()
