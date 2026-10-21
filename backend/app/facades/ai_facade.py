from app.core.config import get_settings
from app.schemas.ai import ParseNaturalLanguageResponse
from app.services.ai_service import generate_trainer_insight, get_groq_client
from app.services.calorie_adjustment_service import decide_adjustment, get_adjustment
from app.services.fuzzy_matcher import get_fuzzy_matcher


class AIFacade:
    def __init__(self, matcher=None, groq_client_provider=get_groq_client):
        self.matcher = matcher or get_fuzzy_matcher()
        self.groq_client_provider = groq_client_provider

    def parse_intent(self, text: str, threshold: float = 0.7, limit_per_category: int = 5) -> ParseNaturalLanguageResponse:
        return self.matcher.match(text=text, threshold=threshold, limit_per_category=limit_per_category)

    def conversational_setup(self, message: str, conversation_history=None):
        matched = self.matcher.match(message)
        intent = matched.detected_intent
        summary = _format_entities(matched)
        settings = get_settings()
        if not settings.groq_api_key:
            if intent == "setup_routine":
                names = ", ".join(item.name for item in matched.exercises) or "your selected exercises"
                reply = f"Got it! I recognized your workout plan with {names}. Would you like me to add this to your programmed training?"
            elif intent == "log_meal":
                names = ", ".join(item.name for item in matched.foods) or "your selected foods"
                slot = matched.meals[0].name if matched.meals else "today's log"
                reply = f"I recognized {names} for {slot}. Please confirm the portion sizes (e.g., in grams) to record your macros."
            elif intent == "setup_routine_and_meal":
                reply = f"I detected both training and nutrition items:\n{summary}\nWould you like me to register both?"
            else:
                reply = f"I processed your message. {summary}\nHow would you like to schedule or log these items?"
            return reply, intent, matched
        prompt = ("You are SET&PLATE's intelligent AI coach assisting the user with setting up routines and logging meals. "
            "Ground your concise, encouraging response in the verified database objects below. Prompt for missing quantities, sets, or reps.\n\n"
            f"Verified DB Objects:\n{summary}\nDetected Intent: {intent}")
        messages = [{"role": "system", "content": prompt}]
        if conversation_history:
            messages.extend(conversation_history[-4:])
        messages.append({"role": "user", "content": message})
        try:
            response = self.groq_client_provider().chat.completions.create(model=settings.groq_model,
                temperature=0.3, max_tokens=220, messages=messages)
            reply = response.choices[0].message.content or "I have processed your request."
        except Exception:
            reply = f"I recognized the following items in your request:\n{summary}"
        return reply, intent, matched

    def trainer_insight(self, **data):
        return generate_trainer_insight(**data)

    def calorie_adjustment(self, **data):
        return get_adjustment(**data)

    def decide_calorie_adjustment(self, **data):
        return decide_adjustment(**data)


def _format_entities(matched):
    groups = (("Routine(s)", matched.routines), ("Exercise(s)", matched.exercises),
              ("Meal Slot(s)", matched.meals), ("Food Item(s)", matched.foods))
    lines = [f"- Recognized {label}: " + ", ".join(f"{item.name} (id: {item.id})" for item in items)
             for label, items in groups if items]
    return "\n".join(lines) if lines else "No database entities recognized."


ai_facade = AIFacade()
