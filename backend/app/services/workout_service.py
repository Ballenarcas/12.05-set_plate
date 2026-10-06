from app.schemas.workout import WorkoutSummary


def get_programmed_workout() -> WorkoutSummary:
    return WorkoutSummary(title="Upper Body", exercise_count=4, duration_minutes=45)
