from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status

from ..schemas import AuthSession, LoginRequest, Profile, RefreshRequest
from ..security import CurrentUser, get_current_user
from ..supabase import SupabaseGateway


router = APIRouter(prefix="/auth", tags=["authentication"])


async def build_session(gateway: SupabaseGateway, data: dict) -> AuthSession:
    token = data["access_token"]
    user = data["user"]
    rows = await gateway.rest(
        "GET",
        "profiles",
        token=token,
        params={"id": f"eq.{user['id']}", "select": "id,display_name,role,status", "limit": "1"},
    )
    if not rows or rows[0].get("status") != "active":
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="This account is not active.")
    return AuthSession(
        access_token=token,
        refresh_token=data["refresh_token"],
        expires_in=data.get("expires_in", 3600),
        token_type=data.get("token_type", "bearer"),
        user=Profile(**rows[0], email=user.get("email")),
    )


@router.post("/login", response_model=AuthSession)
async def login(payload: LoginRequest, request: Request) -> AuthSession:
    gateway = SupabaseGateway(request)
    data = await gateway.request_json(
        "POST",
        "/auth/v1/token?grant_type=password",
        json={"email": str(payload.email), "password": payload.password},
    )
    return await build_session(gateway, data)


@router.post("/refresh", response_model=AuthSession)
async def refresh(payload: RefreshRequest, request: Request) -> AuthSession:
    gateway = SupabaseGateway(request)
    data = await gateway.request_json(
        "POST",
        "/auth/v1/token?grant_type=refresh_token",
        json={"refresh_token": payload.refresh_token},
    )
    return await build_session(gateway, data)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    gateway = SupabaseGateway(request)
    await gateway.request_json("POST", "/auth/v1/logout", token=user.token, expected={204})
    return Response(status_code=status.HTTP_204_NO_CONTENT)
