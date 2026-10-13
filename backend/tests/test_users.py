from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.api import users
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


def test_lookup_user_returns_saved_profile(monkeypatch) -> None:
    monkeypatch.setattr(
        users,
        "get_supabase",
        lambda admin: FakeSupabase(
            [
                {
                    "id": "profile-id",
                    "email": "user@example.com",
                    "Name": "Alex",
                    "Surname": "Rivera",
                    "weight": 70,
                    "height": 175,
                }
            ]
        ),
    )

    response = client.post("/api/v1/users/lookup", json={"email": "user@example.com"})

    assert response.status_code == 200
    assert response.json()["id"] == "profile-id"
    assert response.json()["name"] == "Alex"


def test_lookup_user_returns_not_found(monkeypatch) -> None:
    monkeypatch.setattr(users, "get_supabase", lambda admin: FakeSupabase([]))

    response = client.post("/api/v1/users/lookup", json={"email": "missing@example.com"})

    assert response.status_code == 404
