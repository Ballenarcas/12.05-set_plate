from uuid import UUID

from app.core.auth import issue_access_token


def auth_headers(user_id: str | UUID) -> dict[str, str]:
    token, _ = issue_access_token(str(user_id))
    return {"Authorization": f"Bearer {token}"}
