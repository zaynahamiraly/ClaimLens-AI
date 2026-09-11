import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEMO_CLAIMS } from "@/lib/demo";
import { isDemoMode } from "@/lib/config";
import { requireViewer } from "@/lib/auth";
import type { ClaimDecisionDTO, ClaimDecisionOutcome, ClaimDTO, ClaimStatus } from "@/lib/types";

type ClaimRow = {
  id: string; reference: string; patient_name: string; provider_name: string;
  claimed_amount: number | string | null; currency: string; status: ClaimStatus;
  warning_count: number; created_at: string; client_id: string | null; assigned_to: string | null;
};

export type ClaimProcessingDTO = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "UNAVAILABLE";
  workflowRunId: string | null;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
};

const STALE_JOB_AFTER_MS = 6 * 60 * 1_000;

export type ExtractedFieldDTO = {
  documentId: string | null;
  fieldName: string;
  rawValue: string;
  value: string;
  confidence: number;
  method: string;
  pageNumber: number;
  documentName: string | null;
};

function toDTO(row: ClaimRow, names: Map<string, string>): ClaimDTO {
  return {
    id: row.id,
    reference: row.reference,
    patientName: row.patient_name.trim() || "Pending extraction",
    providerName: row.provider_name.trim() || "Pending extraction",
    amount: row.claimed_amount == null
      ? "Pending extraction"
      : `${row.currency} ${Number(row.claimed_amount).toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    currency: row.currency,
    status: row.status,
    warningCount: row.warning_count,
    createdAt: row.created_at,
    clientId: row.client_id,
    clientName: row.client_id ? names.get(row.client_id) ?? "Client" : null,
    assignedTo: row.assigned_to,
    assignedOfficerName: row.assigned_to ? names.get(row.assigned_to) ?? "Claims officer" : null,
  };
}

async function profileNames(rows: ClaimRow[]) {
  const ids = [...new Set(rows.flatMap((row) => [row.client_id, row.assigned_to]).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id,display_name").in("id", ids);
  return new Map((data ?? []).map((profile) => [profile.id as string, profile.display_name as string]));
}

export async function listClaims(query = "", limit = 50, status?: ClaimStatus, assignedTo?: string): Promise<ClaimDTO[]> {
  await requireViewer();
  const normalized = query.trim().toLowerCase();
  if (isDemoMode) {
    return DEMO_CLAIMS.filter((claim) =>
      `${claim.reference} ${claim.patientName} ${claim.providerName}`.toLowerCase().includes(normalized),
    ).filter((claim) => !status || claim.status === status)
      .filter((claim) => !assignedTo || claim.assignedTo === assignedTo)
      .slice(0, limit);
  }

  const supabase = await createClient();
  let request = supabase
    .from("claims")
    .select("id,reference,patient_name,provider_name,claimed_amount,currency,status,warning_count,created_at,client_id,assigned_to")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (query.trim()) {
    const safe = query.trim().replace(/[,%()]/g, "");
    request = request.or(`reference.ilike.%${safe}%,patient_name.ilike.%${safe}%,provider_name.ilike.%${safe}%`);
  }
  if (status) request = request.eq("status", status);
  if (assignedTo) request = request.eq("assigned_to", assignedTo);
  const { data, error } = await request;
  if (error) throw new Error("Unable to load claims.");
  const rows = data as ClaimRow[];
  const names = await profileNames(rows);
  return rows.map((row) => toDTO(row, names));
}

export const getClaim = cache(async (reference: string): Promise<ClaimDTO | null> => {
  await requireViewer();
  if (isDemoMode) return DEMO_CLAIMS.find((claim) => claim.reference === reference) ?? null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claims")
    .select("id,reference,patient_name,provider_name,claimed_amount,currency,status,warning_count,created_at,client_id,assigned_to")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error("Unable to load this claim.");
  if (!data) return null;
  const row = data as ClaimRow;
  const names = await profileNames([row]);
  return toDTO(row, names);
});

export type ClaimDocumentDTO = {
  id: string;
  name: string;
  mimeType: string;
  signedUrl: string;
  documentType: string;
  amount: number | null;
  currency: string | null;
  amountConfidence: number | null;
  includeInTotal: boolean;
  duplicateOf: string | null;
  extractionStatus: "PENDING" | "COMPLETED" | "NEEDS_CONFIRMATION" | "FAILED";
  notes: string | null;
};

export const getClaimDocuments = cache(async (claimId: string): Promise<ClaimDocumentDTO[]> => {
  await requireViewer();
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data: documents, error } = await supabase
    .from("claim_documents")
    .select("id,original_name,storage_path,mime_type,document_type,extracted_amount,extracted_currency,confirmed_amount,confirmed_currency,amount_confidence,include_in_total,duplicate_of,extraction_status,extraction_notes")
    .eq("claim_id", claimId)
    .order("created_at", { ascending: true });
  if (error || !documents?.length) return [];
  const signedDocuments = await Promise.all(documents.map(async (document) => {
    const { data: signed } = await supabase.storage.from("claim-documents").createSignedUrl(document.storage_path, 300);
    if (!signed?.signedUrl) return null;
    return {
      id: document.id as string,
      name: document.original_name as string,
      mimeType: document.mime_type as string,
      signedUrl: signed.signedUrl,
      documentType: document.document_type as string,
      amount: document.confirmed_amount == null ? document.extracted_amount == null ? null : Number(document.extracted_amount) : Number(document.confirmed_amount),
      currency: (document.confirmed_currency ?? document.extracted_currency) as string | null,
      amountConfidence: document.amount_confidence == null ? null : Number(document.amount_confidence),
      includeInTotal: Boolean(document.include_in_total),
      duplicateOf: document.duplicate_of as string | null,
      extractionStatus: document.extraction_status as ClaimDocumentDTO["extractionStatus"],
      notes: document.extraction_notes as string | null,
    };
  }));
  return signedDocuments.filter((document): document is ClaimDocumentDTO => document !== null);
});

export const getClaimProcessing = cache(async (claimId: string): Promise<ClaimProcessingDTO | null> => {
  await requireViewer();
  if (isDemoMode) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claim_processing_jobs")
    .select("id,status,workflow_run_id,last_error,created_at,finished_at")
    .eq("claim_id", claimId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    return { id: "", status: "UNAVAILABLE", workflowRunId: null, lastError: "Apply the claim-processing database migration before starting this workflow.", createdAt: "", finishedAt: null };
  }
  if (error) throw new Error("Unable to load claim processing status.");
  if (!data) return null;
  const persistedStatus = data.status as ClaimProcessingDTO["status"];
  const stale = (persistedStatus === "QUEUED" || persistedStatus === "RUNNING")
    && Date.now() - new Date(data.created_at as string).getTime() > STALE_JOB_AFTER_MS;
  return {
    id: data.id as string,
    status: stale ? "FAILED" : persistedStatus,
    workflowRunId: data.workflow_run_id as string | null,
    lastError: stale ? "The previous background process stopped unexpectedly. Retry processing." : data.last_error as string | null,
    createdAt: data.created_at as string,
    finishedAt: data.finished_at as string | null,
  };
});

export const getClaimExtractedFields = cache(async (claimId: string): Promise<ExtractedFieldDTO[]> => {
  await requireViewer();
  if (isDemoMode) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claim_extracted_fields")
    .select("document_id,field_name,raw_value,normalized_value,confidence,extraction_method,page_number,claim_documents(original_name)")
    .eq("claim_id", claimId)
    .order("field_name", { ascending: true });
  if (error?.code === "PGRST205" || error?.code === "42P01") return [];
  if (error) throw new Error("Unable to load extracted claim fields.");
  return (data ?? []).map((row) => {
    const document = Array.isArray(row.claim_documents) ? row.claim_documents[0] : row.claim_documents;
    return {
      documentId: row.document_id as string | null,
      fieldName: row.field_name as string,
      rawValue: row.raw_value as string,
      value: row.normalized_value as string,
      confidence: Number(row.confidence),
      method: row.extraction_method as string,
      pageNumber: row.page_number as number,
      documentName: document && "original_name" in document ? document.original_name as string : null,
    };
  });
});

export const getClaimDecision = cache(async (claimId: string): Promise<ClaimDecisionDTO | null> => {
  await requireViewer();
  if (isDemoMode) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claim_decisions")
    .select("outcome,approved_amount,notes,decided_at")
    .eq("claim_id", claimId)
    .maybeSingle();
  if (error?.code === "PGRST205" || error?.code === "42P01") return null;
  if (error) throw new Error("Unable to load the claim decision.");
  if (!data) return null;
  return {
    outcome: data.outcome as ClaimDecisionOutcome,
    approvedAmount: data.approved_amount == null
      ? null
      : `MUR ${Number(data.approved_amount).toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    notes: data.notes as string,
    decidedAt: data.decided_at as string,
  };
});
