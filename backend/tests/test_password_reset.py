import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app.api import users
from app.core import reset_quota
from app.core.security import hash_password, verify_password
from main import app

client = TestClient(app)
USER_ID = "11111111-1111-1111-1111-111111111111"


class FakeTable:
    """Just enough of the Supabase query builder for the reset flow."""

    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self._reset()

    def _reset(self) -> None:
        self.filters: list = []
        self.action = "select"
        self.values: dict = {}

    def select(self, _columns: str) -> "FakeTable":
        self.action = "select"
        return self

    def insert(self, values: dict) -> "FakeTable":
        self.action, self.values = "insert", values
        return self

    def update(self, values: dict) -> "FakeTable":
        self.action, self.values = "update", values
        return self

    def delete(self) -> "FakeTable":
        self.action = "delete"
        return self

    def eq(self, column: str, value) -> "FakeTable":
        self.filters.append(lambda row: row.get(column) == value)
        return self

    def is_(self, column: str, _null: str) -> "FakeTable":
        self.filters.append(lambda row: row.get(column) is None)
        return self

    def limit(self, _count: int) -> "FakeTable":
        return self

    def execute(self) -> SimpleNamespace:
        matching = [row for row in self.rows if all(check(row) for check in self.filters)]
        if self.action == "insert":
            self.rows.append({"id": f"reset-{len(self.rows)}", "used_at": None, **self.values})
            matching = [self.rows[-1]]
        elif self.action == "update":
            for row in matching:
                row.update(self.values)
        elif self.action == "delete":
            self.rows[:] = [row for row in self.rows if row not in matching]
        self._reset()
        return SimpleNamespace(data=matching)


class FakeSupabase:
    def __init__(self) -> None:
        self.tables = {
            "users": [{"id": USER_ID, "email": "user@example.com", "password": hash_password("old-password-123")}],
            "password_resets": [],
        }

    def table(self, name: str) -> FakeTable:
        return FakeTable(self.tables[name])


@pytest.fixture
def db(monkeypatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr(users.onboarding_facade, "supabase_provider", lambda admin: fake)
    monkeypatch.setattr(reset_quota, "_sent", {})
    return fake


@pytest.fixture
def sent(monkeypatch) -> list[tuple[str, str]]:
    emails: list[tuple[str, str]] = []
    monkeypatch.setattr(users, "send_password_reset_email", lambda to, link: emails.append((to, link)))
    return emails


def request_reset(email: str):
    return client.post("/api/v1/users/password-reset/request", json={"email": email})


def token_from(link: str) -> str:
    return parse_qs(urlparse(link).query)["token"][0]


def test_request_answers_the_same_for_known_and_unknown_emails(db, sent) -> None:
    known = request_reset("User@Example.com")
    unknown = request_reset("nobody@example.com")

    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()
    assert [to for to, _ in sent] == ["user@example.com"]


def test_only_the_token_hash_is_stored(db, sent) -> None:
    request_reset("user@example.com")
    token = token_from(sent[0][1])
    stored = db.tables["password_resets"][0]

    assert stored["token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert token not in str(stored)


def test_confirm_sets_the_new_password_once(db, sent) -> None:
    request_reset("user@example.com")
    body = {"token": token_from(sent[0][1]), "new_password": "brand-new-pass-456"}

    first = client.post("/api/v1/users/password-reset/confirm", json=body)
    second = client.post("/api/v1/users/password-reset/confirm", json=body)

    assert first.status_code == 200
    assert verify_password("brand-new-pass-456", db.tables["users"][0]["password"])
    assert not verify_password("old-password-123", db.tables["users"][0]["password"])
    assert second.status_code == 400


def test_expired_or_unknown_links_are_rejected(db, sent) -> None:
    request_reset("user@example.com")
    token = token_from(sent[0][1])
    db.tables["password_resets"][0]["expires_at"] = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

    expired = client.post("/api/v1/users/password-reset/confirm", json={"token": token, "new_password": "brand-new-pass-456"})
    unknown = client.post("/api/v1/users/password-reset/confirm", json={"token": "x" * 43, "new_password": "brand-new-pass-456"})

    assert expired.status_code == unknown.status_code == 400
    assert verify_password("old-password-123", db.tables["users"][0]["password"])


def test_short_new_password_is_rejected(db) -> None:
    response = client.post("/api/v1/users/password-reset/confirm", json={"token": "x" * 43, "new_password": "short"})
    assert response.status_code == 422


def test_a_second_request_within_the_cooldown_sends_nothing(db, sent) -> None:
    assert request_reset("user@example.com").status_code == 200
    assert request_reset("user@example.com").status_code == 200
    assert len(sent) == 1


def test_quota_allows_five_emails_a_day() -> None:
    reset_quota._sent.clear()
    start = 1_000_000.0
    allowed = [reset_quota.allow_reset_email("a@b.co", now=start + index * 200) for index in range(6)]
    assert allowed == [True] * 5 + [False]
    assert reset_quota.allow_reset_email("a@b.co", now=start + 86_400 + 1)


def test_email_goes_out_through_resend_with_the_link(monkeypatch) -> None:
    from app.core.config import get_settings
    from app.services import email_service

    settings = get_settings()
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(settings, "email_from", "SET&PLATE <no-reply@example.com>")
    calls = []

    def fake_post(url, headers, json, timeout):
        calls.append((url, headers, json))
        return SimpleNamespace(is_error=False)

    monkeypatch.setattr(email_service.httpx, "post", fake_post)
    email_service.send_password_reset_email("user@example.com", "https://app.test/reset-password?token=abc")

    url, headers, body = calls[0]
    assert url == "https://api.resend.com/emails"
    assert headers["Authorization"] == "Bearer re_test"
    assert body["to"] == ["user@example.com"]
    assert "https://app.test/reset-password?token=abc" in body["text"]
