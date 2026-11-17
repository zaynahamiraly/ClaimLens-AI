from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from app.config import Settings
from app.supabase import SupabaseGateway

def gateway(secret='sb_secret_test'):
    settings = Settings(supabase_url='https://example.supabase.co', supabase_publishable_key='sb_publishable_test', supabase_secret_key=secret)
    return SupabaseGateway(SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(http=None))), settings)

def test_service_key_is_only_an_api_key():
    assert gateway().headers(service=True) == {'apikey': 'sb_secret_test'}

def test_user_requests_keep_their_scoped_token():
    assert gateway().headers('user-jwt') == {'apikey': 'sb_publishable_test', 'Authorization': 'Bearer user-jwt'}

def test_legacy_service_role_jwt_is_supported():
    assert gateway('eyJlegacy').headers(service=True)['Authorization'] == 'Bearer eyJlegacy'

def test_missing_service_key_is_not_requested_from_mobile_user():
    with pytest.raises(HTTPException) as error:
        gateway('').headers(service=True)
    assert error.value.status_code == 503
    assert 'SECRET_KEY' not in error.value.detail
