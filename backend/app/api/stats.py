from fastapi import APIRouter

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/")
def get_stats() -> dict[str, list]:
    return {"items": []}
