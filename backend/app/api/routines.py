from fastapi import APIRouter

router = APIRouter(prefix="/routines", tags=["routines"])


@router.get("/")
def list_routines() -> dict[str, list]:
    return {"items": []}
