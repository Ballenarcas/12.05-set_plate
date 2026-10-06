from pydantic import BaseModel, Field


class MacroSummary(BaseModel):
    protein_grams: int = Field(ge=0)
    carbs_grams: int = Field(ge=0)
    fat_grams: int = Field(ge=0)
    calories_remaining: int = Field(ge=0)
