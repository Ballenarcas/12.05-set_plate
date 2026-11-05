from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from main import app

from app.schemas.health import HealthActivityDay, HealthActivitySyncRequest, HealthConnectRequest
from app.services import health_service
from tests.auth_helpers import auth_headers

client = TestClient(app)
USER_ID = uuid4()


class FakeQuery:
    def __init__(self, database, table):
        self.database = database
        self.table_name = table
        self.operation = "select"
        self.filters: dict[str, object] = {}
        self.payload = None
        self.limit_value = None
        self.order_column = None

    def select(self, *_):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def gte(self, column, value):
        self.filters[column] = ("gte", value)
        return self

    def lte(self, column, value):
        self.filters[column] = ("lte", value)
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    def order(self, column, **_):
        self.order_column = column
        return self

    def upsert(self, payload, on_conflict=None):
        self.operation = "upsert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        rows = self.database.rows.setdefault(self.table_name, [])
        if self.operation == "upsert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            keys = ("user_id",) if self.table_name == "health_connections" else ("user_id", "activity_date")
            for item in items:
                existing = next(
                    (row for row in rows if all(str(row.get(key)) == str(item.get(key)) for key in keys)),
                    None,
                )
                if existing:
                    existing.update(item)
                else:
                    rows.append(dict(item))
            return SimpleNamespace(data=items)
        if self.operation == "update":
            matched = [row for row in rows if self._matches(row)]
            for row in matched:
                row.update(self.payload)
            return SimpleNamespace(data=matched)
        if self.operation == "delete":
            self.database.rows[self.table_name] = [
                row for row in rows if not self._matches(row)
            ]
            return SimpleNamespace(data=[])

        matched = [row for row in rows if self._matches(row)]
        if self.order_column:
            matched = sorted(matched, key=lambda row: row.get(self.order_column))
        if self.limit_value is not None:
            matched = matched[:self.limit_value]
        return SimpleNamespace(data=matched)

    def _matches(self, row):
        for column, value in self.filters.items():
            if isinstance(value, tuple):
                operation, target = value
                cell = str(row.get(column) or "")
                if operation == "gte" and cell < str(target):
                    return False
                if operation == "lte" and cell > str(target):
                    return False
            elif str(row.get(column)) != str(value):
                return False
        return True


class FakeDatabase:
    def __init__(self):
        self.rows: dict[str, list[dict]] = {}

    def table(self, name):
        return FakeQuery(self, name)


class MissingTableDatabase:
    def table(self, name):
        raise Exception(f"PGRST205 could not find the table 'public.{name}'")


def utc_today():
    return datetime.now(timezone.utc).date()


def activity_days():
    return [
        HealthActivityDay(
            date=utc_today() - timedelta(days=offset),
            steps=6000 + offset * 500,
            active_calories=220 + offset * 10,
        )
        for offset in range(7)
    ]


def test_connect_persists_consent_and_reports_the_activity():
    database = FakeDatabase()
    status = health_service.connect(
        USER_ID,
        HealthConnectRequest(source="preview", days=activity_days()),
        db_session=database,
    )

    assert status.connected is True
    assert status.source.value == "preview"
    assert status.activity.steps_today == 6000
    assert status.activity.steps_avg_7d == 7500
    assert status.last_sync_at is not None
    assert len(status.days) == 7
    assert len(database.rows["health_activity"]) == 7


def test_sync_updates_today_and_keeps_the_window():
    database = FakeDatabase()
    health_service.connect(
        USER_ID,
        HealthConnectRequest(source="preview", days=activity_days()),
        db_session=database,
    )

    status = health_service.sync_activity(
        USER_ID,
        HealthActivitySyncRequest(
            source="preview",
            days=[HealthActivityDay(date=utc_today(), steps=15000, active_calories=700)],
        ),
        db_session=database,
    )

    assert status.activity.steps_today == 15000
    assert status.activity.active_calories_today == 700
    assert status.activity.steps_avg_7d > 7500
    assert len(database.rows["health_activity"]) == 7


def test_sync_requires_a_connection():
    with pytest.raises(ValueError, match="Connect Health Connect"):
        health_service.sync_activity(
            USER_ID,
            HealthActivitySyncRequest(
                source="preview",
                days=[HealthActivityDay(date=utc_today(), steps=1000, active_calories=50)],
            ),
            db_session=FakeDatabase(),
        )


def test_disconnect_revokes_consent_and_deletes_activity():
    database = FakeDatabase()
    health_service.connect(
        USER_ID,
        HealthConnectRequest(source="preview", days=activity_days()),
        db_session=database,
    )

    status = health_service.disconnect(USER_ID, db_session=database)

    assert status.connected is False
    assert status.activity.connected is False
    assert database.rows["health_activity"] == []


def test_missing_tables_fall_back_to_no_activity():
    summary = health_service.get_activity_summary(USER_ID, db_session=MissingTableDatabase())

    assert summary.connected is False
    assert summary.steps_today == 0


def test_api_connects_syncs_and_disconnects(monkeypatch):
    database = FakeDatabase()
    monkeypatch.setattr(health_service, "get_supabase", lambda admin=False: database)

    connected = client.post(
        "/api/v1/health-connect/connect",
        json={"source": "preview", "days": [day.model_dump(mode="json") for day in activity_days()]},
        headers=auth_headers(USER_ID),
    )
    assert connected.status_code == 200, connected.text
    assert connected.json()["connected"] is True

    status = client.get("/api/v1/health-connect/status", headers=auth_headers(USER_ID))
    assert status.status_code == 200, status.text
    assert status.json()["activity"]["steps_avg_7d"] == 7500

    synced = client.post(
        "/api/v1/health-connect/sync",
        json={
            "source": "preview",
            "days": [{"date": utc_today().isoformat(), "steps": 15000, "active_calories": 700}],
        },
        headers=auth_headers(USER_ID),
    )
    assert synced.status_code == 200, synced.text
    assert synced.json()["activity"]["steps_today"] == 15000

    disconnected = client.post(
        "/api/v1/health-connect/disconnect",
        headers=auth_headers(USER_ID),
    )
    assert disconnected.status_code == 200, disconnected.text
    assert disconnected.json()["connected"] is False


def test_api_sync_before_connect_returns_409(monkeypatch):
    monkeypatch.setattr(health_service, "get_supabase", lambda admin=False: FakeDatabase())

    response = client.post(
        "/api/v1/health-connect/sync",
        json={
            "source": "preview",
            "days": [{"date": utc_today().isoformat(), "steps": 1000, "active_calories": 50}],
        },
        headers=auth_headers(USER_ID),
    )

    assert response.status_code == 409
    assert "Connect Health Connect" in response.json()["detail"]


def test_api_status_reports_missing_storage(monkeypatch):
    monkeypatch.setattr(health_service, "get_supabase", lambda admin=False: MissingTableDatabase())

    response = client.get("/api/v1/health-connect/status", headers=auth_headers(USER_ID))

    assert response.status_code == 503
    assert response.json()["detail"] == health_service.STORAGE_ERROR


def test_dashboard_summary_includes_activity(monkeypatch):
    from app.services import dashboard_service
    from app.schemas.health import HealthActivitySummary

    activity = HealthActivitySummary(
        connected=True,
        source="preview",
        steps_today=8000,
        active_calories_today=320,
        steps_avg_7d=9000,
        active_calories_avg_7d=350,
    )
    user = {
        "calorie_goal": 2200, "Name": "Ada", "Surname": "Lovelace",
        "weight": 80, "height": 180, "age": 30, "gender": "Female", "objective": "Weight Loss",
    }
    monkeypatch.setattr(dashboard_service, "get_supabase", lambda admin=True: object())
    monkeypatch.setattr(dashboard_service, "_query_user", lambda user_id: user)
    monkeypatch.setattr(dashboard_service, "_query_today_meals", lambda user_id: {
        "calories": 1200, "protein": 80, "carbs": 100, "fat": 40,
    })
    monkeypatch.setattr(dashboard_service, "_query_workout", lambda user_id: None)
    monkeypatch.setattr(dashboard_service, "_query_todays_plan", lambda user_id: None)
    monkeypatch.setattr(dashboard_service, "_query_completed_workout_today", lambda user_id: None)
    monkeypatch.setattr(dashboard_service, "get_activity_summary", lambda *args, **kwargs: activity)

    summary = dashboard_service.get_dashboard_summary(UUID(str(USER_ID)))

    assert summary.activity == activity
