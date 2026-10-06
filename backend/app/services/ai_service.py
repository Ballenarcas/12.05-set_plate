from functools import lru_cache

from groq import Groq

from app.core.config import get_settings


@lru_cache
def get_groq_client() -> Groq:
    settings = get_settings()
    if not settings.groq_api_key:
        raise ValueError("Groq credentials missing. Set GROQ_API_KEY in your .env file.")
    return Groq(api_key=settings.groq_api_key)


def generate_trainer_insight(
    nutrition_summary: str,
    training_summary: str,
    user_goal: str,
) -> str:
    settings = get_settings()
    response = get_groq_client().chat.completions.create(
        model=settings.groq_model,
        temperature=0.4,
        max_tokens=180,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are SET&PLATE's AI fitness and nutrition coach. "
                    "Give concise, practical, supportive guidance. Do not diagnose medical conditions."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"User goal: {user_goal}\n"
                    f"Nutrition summary: {nutrition_summary}\n"
                    f"Training summary: {training_summary}\n\n"
                    "Provide one actionable insight for today."
                ),
            },
        ],
    )
    return response.choices[0].message.content or "No insight was generated."
