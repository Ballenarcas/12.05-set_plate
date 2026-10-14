from types import SimpleNamespace
from uuid import uuid4

from app.facades import ai_facade as ai_module
from app.facades.dashboard_facade import DashboardFacade
from app.facades.onboarding_facade import OnboardingFacade
from app.schemas.ai import ParseNaturalLanguageResponse
from app.schemas.user import UserOnboardingRequest


def test_dashboard_facade_delegates_summary(monkeypatch):
    expected = object()
    monkeypatch.setattr("app.facades.dashboard_facade.get_dashboard_summary", lambda user_id: expected)
    assert DashboardFacade().get_summary(uuid4()) is expected


def test_conversational_facade_offline_fallback(monkeypatch):
    matched = ParseNaturalLanguageResponse(original_text="hello", detected_intent="general")

    class Matcher:
        def match(self, message):
            return matched

    monkeypatch.setattr(ai_module, "get_settings", lambda: SimpleNamespace(groq_api_key=None))
    reply, intent, entities = ai_module.AIFacade(matcher=Matcher()).conversational_setup("hello")
    assert "No database entities recognized" in reply
    assert intent == "general"
    assert entities is matched


def test_onboarding_facade_returns_upserted_conflict_id():
    existing_id = str(uuid4())
    calls = {}

    class Query:
        def upsert(self, record, on_conflict):
            calls.update(record=record, on_conflict=on_conflict)
            return self

        def execute(self):
            return SimpleNamespace(data=[{"id": existing_id}])

    class Client:
        def table(self, name):
            assert name == "users"
            return Query()

    payload = UserOnboardingRequest(name="Ada", surname="Lovelace", email="ada@example.com")
    response = OnboardingFacade(lambda **_: Client()).register(payload)
    assert response.user_id == existing_id
    assert response.saved_to_supabase is True
    assert calls["on_conflict"] == "email"
    assert calls["record"]["email"] == payload.email
