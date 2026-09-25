from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_claims_require_authentication() -> None:
    response = client.get("/api/v1/claims")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required."
