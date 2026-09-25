from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


Role = Literal["client", "claims_officer", "supervisor", "administrator"]


class Profile(BaseModel):
    id: str
    display_name: str
    role: Role
    status: str
    email: str | None = None


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class AuthSession(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "bearer"
    user: Profile


class ExtractedField(BaseModel):
    id: str | None = None
    document_id: str | None = None
    field_name: str
    raw_value: str
    normalized_value: str
    confidence: float
    extraction_method: str
    page_number: int = 1


class ClaimDocument(BaseModel):
    id: str
    original_name: str
    document_type: str
    mime_type: str
    size_bytes: int
    extraction_status: str
    extracted_amount: Decimal | None = None
    extracted_currency: str | None = None
    confirmed_amount: Decimal | None = None
    confirmed_currency: str | None = None
    amount_confidence: float | None = None
    include_in_total: bool = False
    duplicate_of: str | None = None
    extraction_notes: str | None = None
    signed_url: str | None = None
    fields: list[ExtractedField] = Field(default_factory=list)


class ClaimSummary(BaseModel):
    id: str
    reference: str
    patient_name: str
    provider_name: str
    claimed_amount: Decimal | None = None
    currency: str
    status: str
    warning_count: int = 0
    created_at: datetime
    assigned_to: str | None = None


class ClaimDetails(ClaimSummary):
    documents: list[ClaimDocument] = Field(default_factory=list)
    audit_events: list[dict[str, Any]] = Field(default_factory=list)


class DocumentConfirmation(BaseModel):
    id: str
    include: bool
    amount: Decimal | None = None
    currency: str | None = None


class FieldCorrection(BaseModel):
    id: UUID
    value: str = Field(min_length=1, max_length=500)


class ConfirmClaimRequest(BaseModel):
    patient_name: str = Field(min_length=2, max_length=200)
    provider_name: str = Field(min_length=2, max_length=200)
    documents: list[DocumentConfirmation]
    fields: list[FieldCorrection] = Field(default_factory=list)


class ProcessResult(BaseModel):
    claim_reference: str
    status: str
    document_count: int
    extracted_field_count: int


class DashboardSummary(BaseModel):
    total_claims: int
    processing: int
    review_required: int
    verified: int
    processing_failed: int
    recent_claims: list[ClaimSummary]
