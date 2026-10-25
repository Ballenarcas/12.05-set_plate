from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import ai, dashboard, nutrition, premium, routines, stats, users, workouts
from app.core.config import get_settings
from app.api.settings import router as settings_router

settings = get_settings()
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "message": f"{settings.app_name} is running"}


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
api_router.include_router(dashboard.router)
api_router.include_router(settings_router)
api_router.include_router(premium.router)
app.include_router(api_router)
