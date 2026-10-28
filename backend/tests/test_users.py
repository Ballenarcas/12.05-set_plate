from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import users
from app.core.security import hash_password
from main import app


client = TestClient(app)


class FakeUserQuery:
    def __init__(self, data: list[dict]) -> None:
        self.data = data

    def select(self, _columns: str) -> "FakeUserQuery":
        return self

    def eq(self, _column: str, _value: str) -> "FakeUserQuery":
        return self

    def limit(self, _count: int) -> "FakeUserQuery":
        return self

    def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


class FakeSupabase:
    def __init__(self, data: list[dict]) -> None:
        self.query = FakeUserQuery(data)

    def table(self, _table: str) -> FakeUserQuery:
        return self.query


def test_login_user_returns_profile_for_correct_password(monkeypatch) -> None:
    monkeypatch.setattr(
        users.onboarding_facade,
        "supabase_provider",
        lambda admin: FakeSupabase(
            [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "email": "user@example.com",
                    "password": hash_password("secure-pass-123"),
                    "Name": "Alex",
                    "Surname": "Rivera",
                    "weight": 70,
                    "height": 175,
                }
            ]
        ),
    )

    response = client.post(
        "/api/v1/users/login",
        json={"email": "user@example.com", "password": "secure-pass-123"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == "11111111-1111-1111-1111-111111111111"
    assert response.json()["name"] == "Alex"
    assert response.json()["access_token"]
    assert "password" not in response.json()


def test_login_user_rejects_incorrect_password(monkeypatch) -> None:
    monkeypatch.setattr(
        users.onboarding_facade,
        "supabase_provider",
        lambda admin: FakeSupabase(
            [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "password": hash_password("secure-pass-123"),
                }
            ]
        ),
    )

    response = client.post(
        "/api/v1/users/login",
        json={"email": "user@example.com", "password": "incorrect-pass"},
    )

    assert response.status_code == 401


def test_login_user_rejects_unknown_email(monkeypatch) -> None:
    monkeypatch.setattr(users.onboarding_facade, "supabase_provider", lambda admin: FakeSupabase([]))

    response = client.post(
        "/api/v1/users/login",
        json={"email": "missing@example.com", "password": "secure-pass-123"},
    )

    assert response.status_code == 401


def test_login_body_cannot_choose_a_different_user_than_the_token(monkeypatch) -> None:
    user_id = "22222222-2222-2222-2222-222222222222"
    monkeypatch.setattr(
        users.onboarding_facade,
        "supabase_provider",
        lambda admin: FakeSupabase(
            [{"id": user_id, "email": "user@example.com", "password": hash_password("secure-pass-123")}]
        ),
    )

    response = client.post(
        "/api/v1/users/login",
        json={"email": "user@example.com", "password": "secure-pass-123", "user_id": "attacker"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == user_id
