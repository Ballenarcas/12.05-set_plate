from uuid import uuid4

import httpx
from fastapi.testclient import TestClient
from main import app

from app.facades.dashboard_facade import dashboard_facade
from tests.auth_helpers import auth_headers

client = TestClient(app)


def test_dashboard_dns_failure_returns_503(monkeypatch):
    def fail(*_):
        raise httpx.ConnectError("[Errno 11001] getaddrinfo failed")

    monkeypatch.setattr(dashboard_facade, "get_summary", fail)

    response = client.get(
        "/api/v1/dashboard/summary",
        headers=auth_headers(uuid4()),
    )

    assert response.status_code == 503
    assert "database" in response.json()["detail"].lower()
