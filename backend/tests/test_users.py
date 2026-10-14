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

    def ilike(self, _column: str, _pattern: str) -> "FakeUserQuery":
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
        users,
        "get_supabase",
        lambda admin: FakeSupabase(
            [
                {
                    "id": "profile-id",
                    "email": "user@example.com",
                    "password": hash_password("secure-pass"),
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
        json={"email": "user@example.com", "password": "secure-pass"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == "profile-id"
    assert response.json()["name"] == "Alex"
    assert "password" not in response.json()


def test_login_user_rejects_incorrect_password(monkeypatch) -> None:
    monkeypatch.setattr(
        users,
        "get_supabase",
        lambda admin: FakeSupabase(
            [{"id": "profile-id", "password": hash_password("secure-pass")}]
        ),
    )

    response = client.post(
        "/api/v1/users/login",
        json={"email": "user@example.com", "password": "incorrect-pass"},
    )

    assert response.status_code == 401


def test_login_user_rejects_unknown_email(monkeypatch) -> None:
    monkeypatch.setattr(users, "get_supabase", lambda admin: FakeSupabase([]))

    response = client.post(
        "/api/v1/users/login",
        json={"email": "missing@example.com", "password": "secure-pass"},
    )

    assert response.status_code == 401
