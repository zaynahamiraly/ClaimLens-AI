from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .schemas import Profile
from .supabase import SupabaseGateway


bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    token: str
    profile: Profile


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> CurrentUser:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    gateway = SupabaseGateway(request)
    user = await gateway.request_json("GET", "/auth/v1/user", token=credentials.credentials)
    rows = await gateway.rest(
        "GET",
        "profiles",
        token=credentials.credentials,
        params={"id": f"eq.{user['id']}", "select": "id,display_name,role,status", "limit": "1"},
    )
    if not rows or rows[0].get("status") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account is not active.")
    profile = Profile(**rows[0], email=user.get("email"))
    return CurrentUser(id=user["id"], email=user.get("email"), token=credentials.credentials, profile=profile)
