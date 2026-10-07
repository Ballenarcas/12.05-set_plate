from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, nutrition, routines, stats, users, workouts
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api/v1")


@api_router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(users.router)
api_router.include_router(workouts.router)
api_router.include_router(routines.router)
api_router.include_router(nutrition.router)
api_router.include_router(stats.router)
api_router.include_router(ai.router)
app.include_router(api_router)


@app.get("/")
def read_root() -> dict[str, str | bool]:
    return {
        "status": "SET&PLATE API online",
        "supabase_configured": bool(settings.supabase_url),
    }

