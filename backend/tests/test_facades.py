from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

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


def test_onboarding_facade_inserts_a_new_user():
    store: dict = {"existing": []}

    class Query:
        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def insert(self, record):
            store["record"] = record
            return self

        def execute(self):
            if "record" in store:
                return SimpleNamespace(data=[{"id": store["record"]["id"]}])
            return SimpleNamespace(data=store["existing"])

    class Client:
        def table(self, name):
            assert name == "users"
            return Query()

    payload = UserOnboardingRequest(name="Ada", surname="Lovelace", email="Ada@Example.com")
    response = OnboardingFacade(lambda **_: Client()).register(payload)
    assert response.user_id == store["record"]["id"]
    assert response.saved_to_supabase is True
    assert store["record"]["email"] == "ada@example.com"
    assert response.access_token


def test_onboarding_facade_refuses_an_existing_email():
    store: dict = {"existing": [{"id": str(uuid4())}]}

    class Query:
        def select(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def insert(self, record):
            store["record"] = record
            return self

        def execute(self):
            return SimpleNamespace(data=store["existing"])

    class Client:
        def table(self, name):
            assert name == "users"
            return Query()

    payload = UserOnboardingRequest(name="Ada", surname="Lovelace", email="ada@example.com")

    with pytest.raises(HTTPException) as excinfo:
        OnboardingFacade(lambda **_: Client()).register(payload)

    assert excinfo.value.status_code == 409
    assert "record" not in store
