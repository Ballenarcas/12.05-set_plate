from uuid import UUID

from app.schemas.workout import RoutineSummary
from app.schemas.workout_log import WorkoutLogCreate, WorkoutLogResponse
from app.services import workout_service, wger_importer


class WorkoutFacade:
    def save_log(self, user_id: UUID, payload: WorkoutLogCreate) -> WorkoutLogResponse:
        return workout_service.save_workout_log(user_id, payload)

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
