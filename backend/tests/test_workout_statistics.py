from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api import workouts as workouts_api
from app.schemas.workout_statistics import WorkoutStatisticsResponse
from app.services import workout_statistics_service as statistics_service
from main import app
from tests.auth_helpers import auth_headers

NOW = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)


def workout_set(
    exercise_id: str = "exercise-1",
    *,
    set_number: int = 1,
    reps=10,
    weight=80,
    done=True,
    muscles: list[str] | None = None,
    secondary: list[str] | None = None,
):
    return {
        "exercise_id": exercise_id,
        "set_number": set_number,
        "reps": reps,
        "weight": weight,
        "is_done": done,
        "exercises": {
            "name": exercise_id,
            "muscles": ["Chest"] if muscles is None else muscles,
            "muscles_secondary": secondary or [],
        },
    }


def workout(
    workout_id: str = "workout-1",
    *,
    start: datetime | None = None,
    end: datetime | None = datetime(2026, 10, 20, 11, 0, tzinfo=timezone.utc),
    sets: list[dict] | None = None,
):
    started = start or datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc)
    return {
        "id": workout_id,
        "start_time": started.isoformat(),
        "end_time": end.isoformat() if end else None,
        "workout_sets": [workout_set()] if sets is None else sets,
    }


def aggregate(rows, range_key="1M", *, offset=0, now=NOW):
    start, end = statistics_service.resolve_range_bounds(range_key, now)
    return statistics_service.aggregate_workout_statistics(
        rows,
        range_key=range_key,
        start=start,
        end=end,
        timezone_offset_minutes=offset,
    )


def test_empty_history_returns_zeroes_and_empty_charts():
    result = aggregate([])

    assert result.total_workouts == 0
    assert result.total_volume_kg == 0
    assert result.total_duration_seconds == 0
    assert result.workouts_with_duration == 0
    assert result.eligible_set_count == 0
    assert result.volume_progression == []
    assert result.muscle_group_distribution == []
    assert result.classified_volume_kg == 0
    assert result.unclassified_volume_kg == 0


def test_one_workout_aggregates_reps_times_recorded_weight_and_duration():
    result = aggregate([
        workout(sets=[
            workout_set("bench", set_number=1, reps=10, weight=80, muscles=["Chest"]),
            workout_set("row", set_number=1, reps=8, weight=60, muscles=["Back"]),
        ]),
    ])

    assert result.total_workouts == 1
    assert result.total_volume_kg == 1280
    assert result.total_duration_seconds == 3600
    assert result.workouts_with_duration == 1
    assert result.eligible_set_count == 2
    assert [(point.date.isoformat(), point.volume_kg) for point in result.volume_progression] == [
        ("2026-10-20", 1280),
    ]
    assert [(item.muscle_group, item.volume_kg) for item in result.muscle_group_distribution] == [
        ("Chest", 800),
        ("Back", 480),
    ]
    assert result.classified_volume_kg == 1280
    assert result.unclassified_volume_kg == 0


def test_multiple_workouts_are_summed_and_counted_once_each():
    result = aggregate([
        workout("one", sets=[workout_set(reps=10, weight=50)]),
        workout(
            "two",
            start=datetime(2026, 10, 21, 9, 0, tzinfo=timezone.utc),
            end=datetime(2026, 10, 21, 9, 30, tzinfo=timezone.utc),
            sets=[workout_set(reps=5, weight=40)],
        ),
    ])

    assert result.total_workouts == 2
    assert result.total_volume_kg == 700
    assert result.total_duration_seconds == 5400
    assert result.workouts_with_duration == 2
    assert [point.volume_kg for point in result.volume_progression] == [500, 200]


def test_workouts_outside_the_range_are_excluded():
    result = aggregate([
        workout(
            "old",
            start=datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc),
            end=datetime(2026, 9, 1, 11, 0, tzinfo=timezone.utc),
        ),
        workout("current"),
    ])

    assert result.total_workouts == 1
    assert result.total_volume_kg == 800


def test_range_boundaries_are_inclusive_and_future_workouts_are_excluded():
    one_week_start = NOW - timedelta(days=7)

    result = aggregate([
        workout(
            "at-start",
            start=one_week_start,
            end=one_week_start + timedelta(minutes=30),
            sets=[workout_set(reps=1, weight=10)],
        ),
        workout(
            "before-start",
            start=one_week_start - timedelta(microseconds=1),
            end=one_week_start,
            sets=[workout_set(reps=1, weight=20)],
        ),
        workout(
            "at-end",
            start=NOW,
            end=NOW + timedelta(minutes=30),
            sets=[workout_set(reps=1, weight=30)],
        ),
        workout(
            "future",
            start=NOW + timedelta(seconds=1),
            end=NOW + timedelta(minutes=30),
            sets=[workout_set(reps=1, weight=40)],
        ),
    ], "1W")

    assert result.total_workouts == 2
    assert result.total_volume_kg == 40


def test_incomplete_sets_and_invalid_measurements_are_excluded():
    result = aggregate([
        workout(sets=[
            workout_set(reps=10, weight=80),
            workout_set(set_number=2, done=False, reps=10, weight=80),
            workout_set(set_number=3, weight=None),
            workout_set(set_number=4, reps=0),
            workout_set(set_number=5, weight=-10),
            workout_set(set_number=6, reps="not-a-number"),
            workout_set(set_number=7, weight=float("nan")),
            workout_set(set_number=8, reps=10, weight=2.5),
        ]),
    ])

    assert result.total_workouts == 1
    assert result.total_volume_kg == 825
    assert result.eligible_set_count == 2


def test_missing_and_invalid_durations_do_not_invent_time():
    result = aggregate([
        workout("missing-end", end=None, sets=[workout_set(reps=1, weight=10)]),
        workout(
            "invalid-duration",
            start=datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
            end=datetime(2026, 10, 20, 11, 0, tzinfo=timezone.utc),
            sets=[workout_set(reps=1, weight=20)],
        ),
        {
            "id": "missing-start",
            "start_time": None,
            "end_time": NOW.isoformat(),
            "workout_sets": [workout_set(reps=1, weight=40)],
        },
    ])

    assert result.total_workouts == 1
    assert result.total_duration_seconds == 0
    assert result.workouts_with_duration == 0
    assert result.total_volume_kg == 20


def test_duplicate_workouts_and_sets_are_counted_once():
    duplicate_set = workout_set(set_number=1, reps=10, weight=50)
    result = aggregate([
        workout("duplicate", sets=[duplicate_set, duplicate_set]),
        workout("duplicate", sets=[duplicate_set]),
    ])

    assert result.total_workouts == 1
    assert result.total_volume_kg == 500
    assert result.eligible_set_count == 1


def test_exercises_without_primary_muscle_metadata_are_unclassified():
    result = aggregate([
        workout(sets=[
            workout_set("bench", reps=10, weight=50, muscles=[]),
            workout_set("row", reps=10, weight=30, muscles=["Back"]),
        ]),
    ])

    assert result.total_volume_kg == 800
    assert result.classified_volume_kg == 300
    assert result.unclassified_volume_kg == 500
    assert [item.muscle_group for item in result.muscle_group_distribution] == ["Back"]


def test_multiple_primary_muscles_use_one_attribution_without_double_counting():
    result = aggregate([
        workout(sets=[
            workout_set("press", reps=10, weight=50, muscles=["Chest", "Triceps"], secondary=["Shoulders"]),
        ]),
    ])

    assert result.total_volume_kg == 500
    assert result.classified_volume_kg == 500
    assert [(item.muscle_group, item.volume_kg) for item in result.muscle_group_distribution] == [
        ("Chest", 500),
    ]


def test_summary_and_chart_totals_use_the_same_volume_rules():
    result = aggregate([
        workout("one", sets=[
            workout_set("bench", set_number=1, reps=10, weight=50, muscles=["Chest"]),
            workout_set("row", set_number=1, reps=8, weight=40, muscles=["Back"]),
            workout_set("curl", set_number=1, reps=10, weight=20, muscles=[]),
        ]),
        workout(
            "two",
            start=datetime(2026, 10, 22, 9, 0, tzinfo=timezone.utc),
            end=datetime(2026, 10, 22, 10, 0, tzinfo=timezone.utc),
            sets=[workout_set("squat", reps=5, weight=100, muscles=["Quads"])],
        ),
    ])

    progression_total = sum(point.volume_kg for point in result.volume_progression)
    distribution_total = sum(item.volume_kg for item in result.muscle_group_distribution)

    assert result.total_volume_kg == 1520
    assert progression_total == result.total_volume_kg
    assert distribution_total == result.classified_volume_kg
    assert result.classified_volume_kg + result.unclassified_volume_kg == result.total_volume_kg
    assert result.unclassified_volume_kg == 200


def test_three_month_range_uses_weekly_buckets():
    result = aggregate([
        workout(
            "monday",
            start=datetime(2026, 10, 19, 10, 0, tzinfo=timezone.utc),
            end=datetime(2026, 10, 19, 11, 0, tzinfo=timezone.utc),
            sets=[workout_set(reps=1, weight=10)],
        ),
        workout(
            "tuesday",
            start=datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc),
            end=datetime(2026, 10, 20, 11, 0, tzinfo=timezone.utc),
            sets=[workout_set(reps=1, weight=20)],
        ),
        workout(
            "previous-week",
            start=datetime(2026, 10, 12, 10, 0, tzinfo=timezone.utc),
            end=datetime(2026, 10, 12, 11, 0, tzinfo=timezone.utc),
            sets=[workout_set(reps=1, weight=30)],
        ),
    ], "3M")

    assert result.progression_granularity == "week"
    assert [(point.date.isoformat(), point.volume_kg) for point in result.volume_progression] == [
        ("2026-10-12", 30),
        ("2026-10-19", 30),
    ]


def test_progression_buckets_use_the_client_local_date():
    row = workout(
        "late",
        start=datetime(2026, 10, 25, 1, 0, tzinfo=timezone.utc),
        end=datetime(2026, 10, 25, 2, 0, tzinfo=timezone.utc),
        sets=[workout_set(reps=1, weight=10)],
    )

    utc_plus_two = aggregate([row], "1W", offset=-120)
    utc_minus_two = aggregate([row], "1W", offset=120)

    assert utc_plus_two.volume_progression[0].date.isoformat() == "2026-10-25"
    assert utc_minus_two.volume_progression[0].date.isoformat() == "2026-10-24"


def test_range_bounds_use_calendar_months_and_clamp_month_end():
    start_week, end_week = statistics_service.resolve_range_bounds("1W", NOW)
    start_month, _ = statistics_service.resolve_range_bounds("1M", NOW)
    start_three_months, _ = statistics_service.resolve_range_bounds("3M", NOW)
    january_end = datetime(2026, 3, 31, 12, 0, tzinfo=timezone.utc)
    start_from_march_end, _ = statistics_service.resolve_range_bounds("1M", january_end)

    assert end_week == NOW
    assert start_week == NOW - timedelta(days=7)
    assert start_month == datetime(2026, 9, 25, 12, 0, tzinfo=timezone.utc)
    assert start_three_months == datetime(2026, 7, 25, 12, 0, tzinfo=timezone.utc)
    assert start_from_march_end == datetime(2026, 2, 28, 12, 0, tzinfo=timezone.utc)


class FakeQuery:
    def __init__(self, rows=None, error: Exception | None = None):
        self.rows = rows or []
        self.error = error
        self.calls: list[tuple] = []

    def select(self, columns):
        self.calls.append(("select", columns))
        return self

    def eq(self, key, value):
        self.calls.append(("eq", key, value))
        return self

    @property
    def not_(self):
        self.calls.append(("not_",))
        return self

    def is_(self, key, value):
        self.calls.append(("is_", key, value))
        return self

    def gte(self, key, value):
        self.calls.append(("gte", key, value))
        return self

    def lte(self, key, value):
        self.calls.append(("lte", key, value))
        return self

    def order(self, key, desc=False):
        self.calls.append(("order", key, desc))
        return self

    def limit(self, value):
        self.calls.append(("limit", value))
        return self

    def execute(self):
        if self.error:
            raise self.error
        return SimpleNamespace(data=self.rows)


class FakeClient:
    def __init__(self, query: FakeQuery):
        self.query = query

    def table(self, name):
        assert name == "workouts"
        return self.query


def test_service_filters_by_user_and_range_without_the_history_limit(monkeypatch):
    user_id = uuid4()
    query = FakeQuery([workout()])
    monkeypatch.setattr(statistics_service, "get_supabase", lambda admin=False: FakeClient(query))

    result = statistics_service.get_workout_statistics(user_id, "1W", -120, now=NOW)

    assert result.total_workouts == 1
    assert ("eq", "user_id", str(user_id)) in query.calls
    assert ("not_",) in query.calls
    assert ("is_", "end_time", "null") in query.calls
    assert ("gte", "start_time", (NOW - timedelta(days=7)).isoformat()) in query.calls
    assert ("lte", "start_time", NOW.isoformat()) in query.calls
    assert not any(call[0] == "limit" for call in query.calls)

    select_columns = next(call[1] for call in query.calls if call[0] == "select")
    # Only the ordered primary-muscle metadata is needed; the exercise name is
    # not part of the response, so it must stay out of the projection.
    assert "exercises(muscles)" in select_columns
    assert "exercises(name" not in select_columns
    assert "muscles_secondary" not in select_columns


def test_service_returns_empty_statistics_for_an_empty_history(monkeypatch):
    monkeypatch.setattr(statistics_service, "get_supabase", lambda admin=False: FakeClient(FakeQuery([])))

    result = statistics_service.get_workout_statistics(uuid4(), "1M", now=NOW)

    assert result.total_workouts == 0
    assert result.volume_progression == []
    assert result.muscle_group_distribution == []


def test_service_reports_data_access_errors(monkeypatch):
    monkeypatch.setattr(
        statistics_service,
        "get_supabase",
        lambda admin=False: FakeClient(FakeQuery(error=RuntimeError("database unavailable"))),
    )

    with pytest.raises(HTTPException) as exc_info:
        statistics_service.get_workout_statistics(uuid4(), "1M", now=NOW)

    assert exc_info.value.status_code == 502
    assert "statistics" in str(exc_info.value.detail).lower()


def test_service_reports_missing_supabase_configuration(monkeypatch):
    monkeypatch.setattr(statistics_service, "get_supabase", lambda admin=False: None)

    with pytest.raises(HTTPException) as exc_info:
        statistics_service.get_workout_statistics(uuid4(), "1M", now=NOW)

    assert exc_info.value.status_code == 503


client = TestClient(app)


def statistics_response(range_key="1M") -> WorkoutStatisticsResponse:
    return WorkoutStatisticsResponse(
        range=range_key,
        start_date=NOW - timedelta(days=7),
        end_date=NOW,
        total_workouts=1,
        total_volume_kg=500,
        total_duration_seconds=3600,
        workouts_with_duration=1,
        eligible_set_count=1,
        progression_granularity="week" if range_key == "3M" else "day",
        volume_progression=[{"date": "2026-10-20", "volume_kg": 500}],
        muscle_group_distribution=[{"muscle_group": "Chest", "volume_kg": 500}],
        classified_volume_kg=500,
        unclassified_volume_kg=0,
    )


def test_statistics_route_defaults_to_one_month_and_forwards_the_client_offset(monkeypatch):
    captured = {}

    def fake_statistics(user_id, range_key, timezone_offset_minutes):
        captured.update(
            user_id=user_id,
            range_key=range_key,
            timezone_offset_minutes=timezone_offset_minutes,
        )
        return statistics_response(range_key)

    monkeypatch.setattr(workouts_api.workout_facade, "get_statistics", fake_statistics)

    response = client.get(
        "/api/v1/workouts/statistics?timezone_offset_minutes=-120",
        headers=auth_headers(uuid4()),
    )

    assert response.status_code == 200
    assert response.json()["range"] == "1M"
    assert captured["range_key"] == "1M"
    assert captured["timezone_offset_minutes"] == -120


def test_statistics_route_accepts_supported_ranges_and_rejects_unknown_ranges(monkeypatch):
    captured = {}

    def fake_statistics(user_id, range_key, timezone_offset_minutes):
        captured["range_key"] = range_key
        return statistics_response(range_key)

    monkeypatch.setattr(workouts_api.workout_facade, "get_statistics", fake_statistics)

    response = client.get("/api/v1/workouts/statistics?range=3M", headers=auth_headers(uuid4()))
    invalid = client.get("/api/v1/workouts/statistics?range=1Y", headers=auth_headers(uuid4()))

    assert response.status_code == 200
    assert captured["range_key"] == "3M"
    assert invalid.status_code == 422
