from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class HealthConnectSource(str, Enum):
    HEALTH_CONNECT = "health_connect"
    PREVIEW = "preview"


class HealthScopes(BaseModel):
    steps: bool = True
    active_calories: bool = True


class HealthActivityDay(BaseModel):
    date: date
    steps: int = Field(default=0, ge=0, le=100_000)
    active_calories: int = Field(default=0, ge=0, le=5_000)


class HealthActivitySummary(BaseModel):
    """Exactly what the trainer rules read, so the shape cannot drift per caller."""

    connected: bool = False
    source: HealthConnectSource = HealthConnectSource.HEALTH_CONNECT
    steps_today: int = Field(default=0, ge=0)
    active_calories_today: int = Field(default=0, ge=0)
    steps_avg_7d: int = Field(default=0, ge=0)
    active_calories_avg_7d: int = Field(default=0, ge=0)


class HealthConnectStatus(BaseModel):
    connected: bool = False
    provider: str = "health_connect"
    source: HealthConnectSource = HealthConnectSource.HEALTH_CONNECT
    connected_at: datetime | None = None
    last_sync_at: datetime | None = None
    scopes: HealthScopes = Field(default_factory=HealthScopes)
    activity: HealthActivitySummary = Field(default_factory=HealthActivitySummary)
    days: list[HealthActivityDay] = Field(default_factory=list)


class HealthConnectRequest(BaseModel):
    source: HealthConnectSource = HealthConnectSource.HEALTH_CONNECT
    scopes: HealthScopes = Field(default_factory=HealthScopes)
    days: list[HealthActivityDay] = Field(default_factory=list, max_length=31)


class HealthActivitySyncRequest(BaseModel):
    source: HealthConnectSource = HealthConnectSource.HEALTH_CONNECT
    days: list[HealthActivityDay] = Field(min_length=1, max_length=31)
