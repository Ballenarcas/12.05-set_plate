from fastapi import APIRouter

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.get("/")
def list_workouts() -> dict[str, list]:
    return {"items": []}
