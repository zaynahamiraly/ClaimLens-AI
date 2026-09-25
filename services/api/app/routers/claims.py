from __future__ import annotations

import re
import uuid
import zipfile
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile

from ..processing import process_claim
from ..schemas import (
    ClaimDetails,
    ClaimDocument,
    ClaimSummary,
    ConfirmClaimRequest,
    DashboardSummary,
    ExtractedField,
    ProcessResult,
)
from ..security import CurrentUser, get_current_user
from ..supabase import SupabaseGateway


router = APIRouter(prefix="/claims", tags=["claims"])
ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
CLAIM_SELECT = "id,reference,patient_name,provider_name,claimed_amount,currency,status,warning_count,created_at,assigned_to"


def summary(row: dict[str, Any]) -> ClaimSummary:
    return ClaimSummary(**{key: row.get(key) for key in CLAIM_SELECT.split(",")})


def valid_signature(content: bytes, mime_type: str) -> bool:
    if mime_type == "application/pdf":
        return content.startswith(b"%PDF-")
    if mime_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if mime_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        try:
            with zipfile.ZipFile(BytesIO(content)) as archive:
                return "word/document.xml" in archive.namelist()
        except zipfile.BadZipFile:
            return False
    return False


async def accessible_claim(gateway: SupabaseGateway, token: str, reference: str) -> dict[str, Any]:
    rows = await gateway.rest(
        "GET",
        "claims",
        token=token,
        params={"reference": f"eq.{reference}", "select": "*", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Claim not found.")
    return rows[0]


@router.get("", response_model=list[ClaimSummary])
async def list_claims(
    request: Request,
    status: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
) -> list[ClaimSummary]:
    gateway = SupabaseGateway(request)
    params: dict[str, str] = {"select": CLAIM_SELECT, "order": "created_at.desc", "limit": str(limit)}
    if user.profile.role == "claims_officer":
        params["assigned_to"] = f"eq.{user.id}"
    if status:
        params["status"] = f"eq.{status.upper()}"
    if search and search.strip():
        safe = re.sub(r"[^\w\s-]", "", search.strip())
        if safe:
            params["or"] = f"(reference.ilike.*{safe}*,patient_name.ilike.*{safe}*,provider_name.ilike.*{safe}*)"
    rows = await gateway.rest("GET", "claims", token=user.token, params=params)
    return [summary(row) for row in rows]


@router.get("/dashboard", response_model=DashboardSummary)
async def dashboard(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> DashboardSummary:
    gateway = SupabaseGateway(request)
    params: dict[str, str] = {"select": CLAIM_SELECT, "order": "created_at.desc", "limit": "500"}
    if user.profile.role == "claims_officer":
        params["assigned_to"] = f"eq.{user.id}"
    rows = await gateway.rest("GET", "claims", token=user.token, params=params)
    counts = Counter(row["status"] for row in rows)
    return DashboardSummary(
        total_claims=len(rows),
        processing=counts["PROCESSING"],
        review_required=counts["REVIEW_REQUIRED"],
        verified=counts["VERIFIED"],
        processing_failed=counts["PROCESSING_FAILED"],
        recent_claims=[summary(row) for row in rows[:5]],
    )


@router.post("", response_model=ClaimDetails, status_code=201)
async def create_claim(
    request: Request,
    files: list[UploadFile] = File(...),
    user: CurrentUser = Depends(get_current_user),
) -> ClaimDetails:
    gateway = SupabaseGateway(request)
    settings = gateway.settings
    if not files or len(files) > settings.max_claim_documents:
        raise HTTPException(status_code=422, detail=f"Upload between 1 and {settings.max_claim_documents} documents.")
    prepared: list[tuple[UploadFile, bytes]] = []
    for upload in files:
        content = await upload.read()
        if upload.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=422, detail=f"{upload.filename or 'Document'} is not a PDF, PNG, JPEG, or DOCX file.")
        if not content or len(content) > settings.max_file_bytes:
            raise HTTPException(status_code=422, detail=f"{upload.filename or 'Document'} must be smaller than {settings.max_file_bytes // (1024 * 1024)} MB.")
        if not valid_signature(content, upload.content_type):
            raise HTTPException(status_code=422, detail=f"{upload.filename or 'Document'} does not match its reported file type.")
        prepared.append((upload, content))

    rows = await gateway.rest(
        "POST",
        "claims",
        token=user.token,
        json={"created_by": user.id, "client_id": user.id, "patient_name": "", "provider_name": "", "currency": "MUR", "status": "UPLOADED"},
        prefer="return=representation",
    )
    claim = rows[0]
    documents: list[dict[str, Any]] = []
    uploaded_paths: list[str] = []
    try:
        for upload, content in prepared:
            original = Path(upload.filename or f"document{ALLOWED_MIME_TYPES[upload.content_type]}").name
            safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", original)[:160]
            storage_path = f"{user.id}/{claim['id']}/{uuid.uuid4().hex}-{safe_name}"
            await gateway.upload(storage_path, content, upload.content_type, user.token)
            uploaded_paths.append(storage_path)
            inserted = await gateway.rest(
                "POST",
                "claim_documents",
                token=user.token,
                json={
                    "claim_id": claim["id"],
                    "uploaded_by": user.id,
                    "document_type": "UNKNOWN",
                    "original_name": original,
                    "storage_path": storage_path,
                    "mime_type": upload.content_type,
                    "size_bytes": len(content),
                },
                prefer="return=representation",
            )
            documents.append(inserted[0])
            await gateway.rest(
                "POST",
                "audit_events",
                token=user.token,
                json={"claim_id": claim["id"], "actor_id": user.id, "event_type": "DOCUMENT_UPLOADED", "metadata": {"document_id": inserted[0]["id"], "name": original}},
            )
        await gateway.rest("POST", "audit_events", token=user.token, json={"claim_id": claim["id"], "actor_id": user.id, "event_type": "CLAIM_CREATED", "metadata": {"document_count": len(documents)}})
    except Exception:
        try:
            await gateway.delete_objects(uploaded_paths, user.token)
            await gateway.rest("DELETE", "claims", token=user.token, params={"id": f"eq.{claim['id']}"})
        except Exception:
            pass
        raise
    return ClaimDetails(
        **summary(claim).model_dump(),
        documents=[ClaimDocument(**document, fields=[]) for document in documents],
        audit_events=[],
    )


@router.get("/{reference}", response_model=ClaimDetails)
async def get_claim(
    reference: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> ClaimDetails:
    gateway = SupabaseGateway(request)
    claim = await accessible_claim(gateway, user.token, reference)
    documents = await gateway.rest("GET", "claim_documents", token=user.token, params={"claim_id": f"eq.{claim['id']}", "select": "*", "order": "created_at.asc"})
    fields = await gateway.rest("GET", "claim_extracted_fields", token=user.token, params={"claim_id": f"eq.{claim['id']}", "select": "*", "order": "created_at.asc"})
    audit = await gateway.rest("GET", "audit_events", token=user.token, params={"claim_id": f"eq.{claim['id']}", "select": "id,event_type,metadata,created_at,actor_id", "order": "created_at.desc", "limit": "100"})
    grouped: dict[str, list[ExtractedField]] = {}
    for field in fields:
        grouped.setdefault(field.get("document_id") or "", []).append(ExtractedField(**field))
    response_documents = []
    for document in documents:
        signed_url = await gateway.signed_url(document["storage_path"], user.token)
        response_documents.append(ClaimDocument(**document, signed_url=signed_url, fields=grouped.get(document["id"], [])))
    return ClaimDetails(**summary(claim).model_dump(), documents=response_documents, audit_events=audit)


@router.post("/{reference}/process", response_model=ProcessResult)
async def process(
    reference: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> ProcessResult:
    gateway = SupabaseGateway(request)
    claim = await accessible_claim(gateway, user.token, reference)
    if claim["status"] not in {"UPLOADED", "PROCESSING_FAILED"}:
        raise HTTPException(status_code=409, detail="This claim is not available for processing.")
    active = await gateway.rest("GET", "claim_processing_jobs", service=True, params={"claim_id": f"eq.{claim['id']}", "status": "in.(QUEUED,RUNNING)", "select": "id", "limit": "1"})
    if active:
        raise HTTPException(status_code=409, detail="Document processing is already running.")
    return await process_claim(gateway, claim, user.id)


@router.post("/{reference}/confirm")
async def confirm_claim(
    reference: str,
    payload: ConfirmClaimRequest,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
) -> dict[str, str]:
    gateway = SupabaseGateway(request)
    claim = await accessible_claim(gateway, user.token, reference)
    if user.profile.role != "client" or claim.get("client_id") != user.id or claim.get("status") != "UPLOADED":
        raise HTTPException(status_code=403, detail="Only the claim owner can confirm this draft.")
    if payload.fields:
        correction_ids = [str(item.id) for item in payload.fields]
        existing = await gateway.rest(
            "GET",
            "claim_extracted_fields",
            service=True,
            params={"claim_id": f"eq.{claim['id']}", "id": f"in.({','.join(correction_ids)})", "select": "id,field_name,normalized_value"},
        )
        existing_by_id = {row["id"]: row for row in existing}
        if set(correction_ids) != set(existing_by_id):
            raise HTTPException(status_code=422, detail="One or more corrected fields do not belong to this claim.")
        for correction in payload.fields:
            field_id = str(correction.id)
            previous = existing_by_id[field_id]
            value = correction.value.strip()
            if value == previous["normalized_value"]:
                continue
            await gateway.rest(
                "PATCH",
                "claim_extracted_fields",
                service=True,
                params={"id": f"eq.{field_id}", "claim_id": f"eq.{claim['id']}"},
                json={"raw_value": value, "normalized_value": value, "confidence": 0, "extraction_method": "human_corrected"},
            )
            await gateway.rest(
                "POST",
                "audit_events",
                service=True,
                json={
                    "claim_id": claim["id"],
                    "actor_id": user.id,
                    "event_type": "FIELD_CORRECTED",
                    "metadata": {"field_name": previous["field_name"], "previous_value": previous["normalized_value"], "corrected_value": value, "source": "mobile_client_confirmation"},
                },
            )
    status_value = await gateway.rest(
        "POST",
        "rpc/confirm_claim",
        token=user.token,
        json={
            "p_reference": reference,
            "p_patient_name": payload.patient_name.strip(),
            "p_provider_name": payload.provider_name.strip(),
            "p_documents": [
                {"id": item.id, "include": item.include, "amount": str(item.amount) if item.amount is not None else None, "currency": item.currency.upper() if item.currency else None}
                for item in payload.documents
            ],
        },
    )
    return {"status": str(status_value)}
