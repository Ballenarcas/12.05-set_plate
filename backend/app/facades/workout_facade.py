from uuid import UUID

from app.schemas.workout import RoutineSummary
from app.schemas.workout_log import WorkoutHistoryResponse, WorkoutLogCreate, WorkoutLogResponse
from app.db.supabase_client import get_supabase
from app.services import workout_service, wger_importer
from app.services.workout_adjustment_service import plan_daily_workout
from fastapi import HTTPException


class WorkoutFacade:
    async def plan_today(self, user_id: UUID):
        supabase = get_supabase(admin=True)
        if supabase is None:
            raise HTTPException(status_code=503, detail="Supabase is not configured")
        return await plan_daily_workout(user_id, supabase)

    def save_log(self, user_id: UUID, payload: WorkoutLogCreate) -> WorkoutLogResponse:
        return workout_service.save_workout_log(user_id, payload)

    def list_history(self, user_id: UUID, limit: int = 30) -> WorkoutHistoryResponse:
        return workout_service.list_workout_history(user_id, limit)

    def delete_history_entry(self, user_id: UUID, workout_id: UUID) -> None:
        workout_service.delete_workout_history_entry(user_id, workout_id)

    def list_routines(self, user_id: UUID) -> list[RoutineSummary]:
        return workout_service.list_user_routines(user_id)

    def programmed_workout(self):
        return workout_service.get_programmed_workout()

    def list_exercises(self, **filters):
        return workout_service.list_exercises(**filters)

    def get_exercise_categories(self):
        return workout_service.get_exercise_categories()

    def get_exercise_by_id(self, exercise_id: str):
        return workout_service.get_exercise_by_id(exercise_id)

    def import_wger(self, **options):
        return wger_importer.run_import(**options)


workout_facade = WorkoutFacade()
