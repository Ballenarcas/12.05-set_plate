from pydantic import BaseModel, Field


class Exercise(BaseModel):
    id: str
    name: str
    muscle_group: str = "General"
    name_es: str | None = None
    category: str = "General"
    description: str | None = None
    muscles: list[str] = Field(default_factory=list)
    muscles_secondary: list[str] = Field(default_factory=list)
    equipment: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    images: list[str] = Field(default_factory=list)


class ExerciseListResponse(BaseModel):
    items: list[Exercise]
    total: int
    page: int = 1
    limit: int = 50
