from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from main import app

from app.core.security import hash_password, verify_password

client = TestClient(app)

PAYLOAD = {
    "name": "Ana",
    "surname": "Ruiz",
    "email": "ana@example.com",
    "password": "secret-pass-1234",
    "age": 30,
    "gender": "female",
    "weight": 62.0,
    "height": 168,
    "objective": "lose weight",
}


def _mock_supabase(existing_rows=None):
    supabase = MagicMock()
    select_chain = supabase.table.return_value.select.return_value
    select_chain.eq.return_value.limit.return_value.execute.return_value = MagicMock(
        data=existing_rows or []
    )
    supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": "generated-id"}]
    )
    return supabase


def _inserted_record(supabase):
    return supabase.table.return_value.insert.call_args.args[0]


def test_password_is_hashed_not_stored_in_plaintext():
    supabase = _mock_supabase()
    with patch("app.facades.onboarding_facade.get_supabase", return_value=supabase):
        response = client.post("/api/v1/users/onboarding", json=PAYLOAD)

    assert response.status_code == 200
    stored = _inserted_record(supabase)
    assert stored["password"] != PAYLOAD["password"]
    assert verify_password(PAYLOAD["password"], stored["password"])


def test_existing_email_is_rejected_without_writing():
    supabase = _mock_supabase(existing_rows=[{"id": "existing-id"}])
    with patch("app.facades.onboarding_facade.get_supabase", return_value=supabase):
        response = client.post("/api/v1/users/onboarding", json=PAYLOAD)

    # Signing up an existing email must never overwrite that account's profile.
    assert response.status_code == 409
    supabase.table.return_value.insert.assert_not_called()


def test_hash_password_roundtrip():
    hashed = hash_password("secret-pass-1234")
    assert hashed != "secret-pass-1234"
    assert verify_password("secret-pass-1234", hashed)
    assert not verify_password("wrong", hashed)


def test_hash_password_handles_long_and_unicode():
    long_unicode = "contraseña muy larga " * 10
    hashed = hash_password(long_unicode)
    assert verify_password(long_unicode, hashed)


def test_hash_password_is_salted_per_call():
    # Identical passwords must not produce identical hashes, otherwise the
    # table is vulnerable to rainbow tables and reveals duplicate passwords.
    first = hash_password("secret-pass-1234")
    second = hash_password("secret-pass-1234")
    assert first != second
    assert verify_password("secret-pass-1234", first)
    assert verify_password("secret-pass-1234", second)


def test_verify_password_rejects_malformed_stored_hash():
    # A garbage/legacy value in the column must not raise; bcrypt throws
    # ValueError("Invalid salt"), which would surface as a 500 on login.
    assert not verify_password("secret-pass-1234", "not-a-valid-hash")
    assert not verify_password("secret-pass-1234", "")
    assert not verify_password("", "not-a-valid-hash")


def test_password_hash_is_never_returned_to_the_client():
    supabase = _mock_supabase()
    with patch("app.facades.onboarding_facade.get_supabase", return_value=supabase):
        response = client.post("/api/v1/users/onboarding", json=PAYLOAD)

    assert response.status_code == 200
    body = response.text
    assert PAYLOAD["password"] not in body
    assert _inserted_record(supabase)["password"] not in body


def test_omitted_password_writes_no_password_column():
    payload = {k: v for k, v in PAYLOAD.items() if k != "password"}
    supabase = _mock_supabase()
    with patch("app.facades.onboarding_facade.get_supabase", return_value=supabase):
        response = client.post("/api/v1/users/onboarding", json=payload)

    assert response.status_code == 200
    assert "password" not in _inserted_record(supabase)


def test_short_password_is_rejected_by_schema():
    payload = {**PAYLOAD, "password": "abc"}
    supabase = _mock_supabase()
    with patch("app.facades.onboarding_facade.get_supabase", return_value=supabase):
        response = client.post("/api/v1/users/onboarding", json=payload)

    assert response.status_code == 422
    supabase.table.return_value.insert.assert_not_called()
