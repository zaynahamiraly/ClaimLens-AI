from fastapi.testclient import TestClient

from app.main import APP_NAME, APP_VERSION, app


client = TestClient(app)


def test_root_reports_service_identity() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
    }


def test_health_endpoint_reports_healthy() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "service": APP_NAME,
        "version": APP_VERSION,
    }
