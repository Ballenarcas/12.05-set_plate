from functools import lru_cache
from typing import Any

try:
    from groq import Groq
except ImportError:
    Groq = None

from app.core.config import get_settings


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


def format_grounded_entities_summary(matched: "ParseNaturalLanguageResponse") -> str:
    """Format matched DB objects into a readable context string for prompt grounding."""
    lines = []
    if matched.routines:
        items = ", ".join(f"{r.name} (id: {r.id})" for r in matched.routines)
        lines.append(f"- Recognized Routine(s): {items}")
    if matched.exercises:
        items = ", ".join(f"{e.name} (id: {e.id})" for e in matched.exercises)
        lines.append(f"- Recognized Exercise(s): {items}")
    if matched.meals:
        items = ", ".join(f"{m.name} (id: {m.id})" for m in matched.meals)
        lines.append(f"- Recognized Meal Slot(s): {items}")
    if matched.foods:
        items = ", ".join(
            f"{f.name} (id: {f.id}, {f.metadata.get('calories_per_100g', 0)} kcal/100g)"
            for f in matched.foods
        )
        lines.append(f"- Recognized Food Item(s): {items}")
    return "\n".join(lines) if lines else "No database entities recognized."


def handle_conversational_setup(
    message: str,
    conversation_history: list[dict[str, str]] | None = None,
) -> tuple[str, str, "ParseNaturalLanguageResponse"]:
    """
    Processes natural language message to setup routines or log meals.
    Fuzzy-matches DB objects and produces an AI-grounded confirmation response.
    """
    from app.services.fuzzy_matcher import get_fuzzy_matcher

    matcher = get_fuzzy_matcher()
    matched = matcher.match(message)
    intent = matched.detected_intent

    entity_summary = format_grounded_entities_summary(matched)

    settings = get_settings()
    if not settings.groq_api_key:
        # Graceful fallback when running offline or without Groq API key
        if intent == "setup_routine":
            ex_names = ", ".join(e.name for e in matched.exercises) or "your selected exercises"
            reply = (
                f"Got it! I recognized your workout plan with {ex_names}. "
                "Would you like me to add this to your programmed training?"
            )
        elif intent == "log_meal":
            food_names = ", ".join(f.name for f in matched.foods) or "your selected foods"
            meal_slot = matched.meals[0].name if matched.meals else "today's log"
            reply = (
                f"I recognized {food_names} for {meal_slot}. "
                "Please confirm the portion sizes (e.g., in grams) to record your macros."
            )
        elif intent == "setup_routine_and_meal":
            reply = (
                f"I detected both training and nutrition items:\n{entity_summary}\n"
                "Would you like me to register both?"
            )
        else:
            reply = (
                f"I processed your message. {entity_summary}\n"
                "How would you like to schedule or log these items?"
            )
        return reply, intent, matched

    system_prompt = (
        "You are SET&PLATE's intelligent AI coach assisting the user with setting up routines and logging meals. "
        "You have access to verified database objects extracted from natural language via fuzzy matching. "
        "Always ground your response in the verified database objects provided below. "
        "Acknowledge the recognized exercises or foods specifically by their official names. "
        "Be encouraging, concise (under 3 sentences), and prompt for any missing quantities/sets/reps.\n\n"
        f"Verified DB Objects:\n{entity_summary}\nDetected Intent: {intent}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    if conversation_history:
        messages.extend(conversation_history[-4:])
    messages.append({"role": "user", "content": message})

    try:
        response = get_groq_client().chat.completions.create(
            model=settings.groq_model,
            temperature=0.3,
            max_tokens=220,
            messages=messages,
        )
        reply = response.choices[0].message.content or "I have processed your request."
    except Exception:
        # Fallback if API call times out or errors
        reply = f"I recognized the following items in your request:\n{entity_summary}"

    return reply, intent, matched

