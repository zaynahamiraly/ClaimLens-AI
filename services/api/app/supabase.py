from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, Request, status

from .config import Settings, get_settings


class SupabaseGateway:
    def __init__(self, request: Request, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        try:
            self.settings.require_supabase()
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        self.http: httpx.AsyncClient = request.app.state.http

    def headers(
        self,
        token: str | None = None,
        *,
        service: bool = False,
        prefer: str | None = None,
    ) -> dict[str, str]:
        key = self.settings.supabase_secret_key if service else self.settings.supabase_publishable_key
        if service and not key:
            raise HTTPException(
                status_code=503,
                detail="SUPABASE_SECRET_KEY is required for document processing.",
            )
        headers = {"apikey": key, "Authorization": f"Bearer {token or key}"}
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def request_json(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        service: bool = False,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
        expected: set[int] | None = None,
    ) -> Any:
        response = await self.http.request(
            method,
            f"{self.settings.supabase_url}{path}",
            headers=self.headers(token, service=service, prefer=prefer),
            params=params,
            json=json,
        )
        if response.status_code not in (expected or {200, 201, 204}):
            self.raise_for_response(response)
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def rest(
        self,
        method: str,
        table_or_rpc: str,
        *,
        token: str | None = None,
        service: bool = False,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> Any:
        return await self.request_json(
            method,
            f"/rest/v1/{table_or_rpc}",
            token=token,
            service=service,
            params=params,
            json=json,
            prefer=prefer,
        )

    async def upload(self, path: str, content: bytes, content_type: str, token: str) -> None:
        response = await self.http.post(
            f"{self.settings.supabase_url}/storage/v1/object/{self.settings.storage_bucket}/{quote(path, safe='/')}",
            headers={
                **self.headers(token),
                "Content-Type": content_type,
                "x-upsert": "false",
            },
            content=content,
        )
        if response.status_code not in {200, 201}:
            self.raise_for_response(response)

    async def download(self, path: str, *, service: bool = True) -> bytes:
        response = await self.http.get(
            f"{self.settings.supabase_url}/storage/v1/object/authenticated/{self.settings.storage_bucket}/{quote(path, safe='/')}",
            headers=self.headers(service=service),
        )
        if response.status_code != 200:
            self.raise_for_response(response)
        return response.content

    async def delete_objects(self, paths: list[str], token: str) -> None:
        if not paths:
            return
        await self.request_json(
            "DELETE",
            f"/storage/v1/object/{self.settings.storage_bucket}",
            token=token,
            json={"prefixes": paths},
        )

    async def signed_url(self, path: str, token: str, expires_in: int = 900) -> str | None:
        data = await self.request_json(
            "POST",
            f"/storage/v1/object/sign/{self.settings.storage_bucket}/{quote(path, safe='/')}",
            token=token,
            json={"expiresIn": expires_in},
        )
        value = data.get("signedURL") if isinstance(data, dict) else None
        if not value:
            return None
        return value if value.startswith("http") else f"{self.settings.supabase_url}/storage/v1{value}"

    @staticmethod
    def raise_for_response(response: httpx.Response) -> None:
        detail = "Supabase request failed."
        try:
            body = response.json()
            detail = body.get("msg") or body.get("message") or body.get("error_description") or body.get("error") or detail
        except ValueError:
            if response.text:
                detail = response.text[:500]
        code = status.HTTP_401_UNAUTHORIZED if response.status_code in {401, 403} else status.HTTP_400_BAD_REQUEST
        if response.status_code >= 500:
            code = status.HTTP_502_BAD_GATEWAY
        raise HTTPException(status_code=code, detail=str(detail))
