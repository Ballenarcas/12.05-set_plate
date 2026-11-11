import logging
import threading
from contextlib import asynccontextmanager

import httpx
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.api import ai, dashboard, nutrition, premium, routines, users, workouts
from app.core.config import get_settings
from app.api.settings import router as settings_router
from app.db.supabase_client import warm_supabase

settings = get_settings()
logger = logging.getLogger(__name__)

if "*" in settings.cors_origin_list:
    raise RuntimeError("CORS_ORIGINS must list explicit origins; '*' is not allowed.")


@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=warm_supabase, daemon=True).start()
    yield


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

if settings.allowed_hosts_list:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["WWW-Authenticate"],
    max_age=600,
)


@app.exception_handler(httpx.ConnectError)
async def database_unreachable(_request, _exc) -> JSONResponse:
    logger.warning("Database connection failed")
    return JSONResponse(
        status_code=503,
        content={"detail": "Could not reach the database. Check your network and try again."},
    )


@app.exception_handler(httpx.TimeoutException)
async def database_timeout(_request, _exc) -> JSONResponse:
    logger.warning("Database request timed out")
    return JSONResponse(
        status_code=503,
        content={"detail": "The database took too long to answer. Try again."},
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "message": f"{settings.app_name} is running"}


api_router = APIRouter(prefix="/api/v1")


@app.get("/health", include_in_schema=False)
@api_router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(users.router)
api_router.include_router(workouts.router)
api_router.include_router(routines.router)
api_router.include_router(nutrition.router)
api_router.include_router(ai.router)
api_router.include_router(dashboard.router)
api_router.include_router(settings_router)
api_router.include_router(premium.router)
app.include_router(api_router)
