import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app.main import app
from app.supabase import SupabaseGateway

@pytest.fixture
def calls(monkeypatch):
    recorded = []
    monkeypatch.setattr(SupabaseGateway, '__init__', lambda self, request: None)
    async def request(self, method, path, **kwargs):
        recorded.append((method, path, kwargs))
        if path == '/auth/v1/verify':
            return {'access_token': 'verified-recovery-session'}
        return {}
    monkeypatch.setattr(SupabaseGateway, 'request_json', request)
    return recorded

def test_signup_passes_name_but_never_role(calls):
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/signup', json={'email': 'Client@example.com', 'display_name': 'Test Client', 'password': 'test-password', 'role': 'administrator'})
    assert response.status_code == 200
    assert calls[0][2]['json']['data'] == {'display_name': 'Test Client'}
    assert calls[0][2]['json']['email'] == 'client@example.com'
    assert 'access_token' not in response.json()

def test_recovery_request_returns_neutral_message(calls):
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/forgot-password', json={'email': 'client@example.com'})
    assert response.status_code == 200
    assert 'If an account exists' in response.json()['message']
    assert calls[0][1] == '/auth/v1/recover'

def test_password_update_requires_recovery_session(calls):
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/reset-password', json={'email': 'client@example.com', 'code': '123456', 'password': 'new-password'})
    assert response.status_code == 200
    assert calls[0][2]['json']['type'] == 'recovery'
    assert calls[1][2]['token'] == 'verified-recovery-session'
    assert calls[1][1] == '/auth/v1/user'

def test_rejected_code_never_changes_password(monkeypatch, calls):
    async def reject(self, method, path, **kwargs):
        calls.append(path)
        raise HTTPException(400, 'Invalid code')
    monkeypatch.setattr(SupabaseGateway, 'request_json', reject)
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/reset-password', json={'email': 'client@example.com', 'code': '123456', 'password': 'new-password'})
    assert response.status_code == 400
    assert calls == ['/auth/v1/verify']

def test_weak_password_rejected_before_upstream(calls):
    with TestClient(app) as client:
        response = client.post('/api/v1/auth/signup', json={'email': 'client@example.com', 'display_name': 'Test', 'password': 'short'})
    assert response.status_code == 422
    assert calls == []
