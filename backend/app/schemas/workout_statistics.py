from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

WorkoutStatisticsRange = Literal["1W", "1M", "3M"]
ProgressionGranularity = Literal["day", "week"]


class VolumeProgressionPoint(BaseModel):
    date: date
    volume_kg: float = Field(ge=0)


class MuscleGroupVolume(BaseModel):
    muscle_group: str
    volume_kg: float = Field(ge=0)


class WorkoutStatisticsResponse(BaseModel):
    range: WorkoutStatisticsRange
    start_date: datetime
    end_date: datetime
    total_workouts: int = Field(ge=0)
    total_volume_kg: float = Field(ge=0)
    total_duration_seconds: int = Field(ge=0)
    workouts_with_duration: int = Field(ge=0)
    eligible_set_count: int = Field(ge=0)
    progression_granularity: ProgressionGranularity
    volume_progression: list[VolumeProgressionPoint]
    muscle_group_distribution: list[MuscleGroupVolume]
    classified_volume_kg: float = Field(ge=0)
    unclassified_volume_kg: float = Field(ge=0)
