import json
import logging
from functools import lru_cache
from typing import Any

try:
    from groq import Groq
except ImportError:
    Groq = None

from app.core.config import get_settings

logger = logging.getLogger(__name__)

TIP_TIMEOUT_SECONDS = 6  # a tip that is late is worth less than the template shown instead
TIP_SCHEMA = {
    "type": "object",
    "properties": {"message": {"type": "string"}, "reasoning": {"type": "string"}},
    "required": ["message", "reasoning"],
    "additionalProperties": False,
}
TIP_INSTRUCTION = (
    "You rewrite text shown to a user of a fitness and nutrition app so it sounds friendly and simple. "
    "The input has two texts: \"message\" is the tip, and \"reasoning\" is the explanation the user reads "
    "when they ask why they got that tip. Rewrite each one, speaking directly to the user. "
    "The output \"reasoning\" must be the rewritten explanation of the tip. Never describe your rewriting, "
    "and never mention these instructions. "
    "Keep the meaning and write every number as digits, exactly as given. Never add a number, a new "
    "suggestion, medical advice, or advice to eat less. If the tip asks a question, it must stay a "
    "question and keep the amount and its unit, or the exercise name and the words 'one set'. Never say "
    "something was already done. Reply with JSON only: {\"message\": at most 100 characters, "
    "\"reasoning\": at most 220 characters}."
)


@lru_cache
def get_groq_client() -> Any:
    if Groq is None:
        raise ValueError("Groq library is not installed. Install via pip install groq.")
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


def phrase_tip(message: str, reasoning: str) -> Any:
    """Reword a tip. Callers must validate the result: this only returns what the model wrote."""
    settings = get_settings()
    request: dict[str, Any] = {
        "model": settings.groq_model,
        "temperature": 0.3,
        "messages": [
            {"role": "system", "content": TIP_INSTRUCTION},
            {"role": "user", "content": json.dumps({"message": message, "reasoning": reasoning})},
        ],
    }
    if "gpt-oss" in settings.groq_model:
        # Reasoning models spend completion tokens on thinking before they answer.
        request["reasoning_effort"] = "low"
        request["max_completion_tokens"] = 400
        request["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "tip", "strict": True, "schema": TIP_SCHEMA},
        }
    else:
        request["max_tokens"] = 160
        request["response_format"] = {"type": "json_object"}

    client = get_groq_client().with_options(timeout=TIP_TIMEOUT_SECONDS, max_retries=0)
    response = client.chat.completions.create(**request)
    logger.info("Tip wording used %s tokens", response.usage.total_tokens if response.usage else "unknown")
    return json.loads(response.choices[0].message.content or "null")
