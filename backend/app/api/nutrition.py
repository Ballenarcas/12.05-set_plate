from fastapi import APIRouter

router = APIRouter(prefix="/nutrition", tags=["nutrition"])


@router.get("/")
def get_nutrition_summary() -> dict[str, list]:
    return {"items": []}
