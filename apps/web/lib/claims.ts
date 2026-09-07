import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEMO_CLAIMS } from "@/lib/demo";
import { isDemoMode } from "@/lib/config";
import { requireViewer } from "@/lib/auth";
import type { ClaimDTO, ClaimStatus } from "@/lib/types";

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

export type ExtractedFieldDTO = {
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
    patientName: row.patient_name,
    providerName: row.provider_name,
    amount: row.claimed_amount == null
      ? "Pending extraction"
      : `${row.currency} ${Number(row.claimed_amount).toLocaleString("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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

export const getClaimDocument = cache(async (claimId: string) => {
  await requireViewer();
  if (isDemoMode) return null;
  const supabase = await createClient();
  const { data: document, error } = await supabase
    .from("claim_documents")
    .select("original_name,storage_path,mime_type")
    .eq("claim_id", claimId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !document) return null;
  const { data: signed } = await supabase.storage.from("claim-documents").createSignedUrl(document.storage_path, 300);
  if (!signed?.signedUrl) return null;
  return { name: document.original_name as string, mimeType: document.mime_type as string, signedUrl: signed.signedUrl };
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
  return {
    id: data.id as string,
    status: data.status as ClaimProcessingDTO["status"],
    workflowRunId: data.workflow_run_id as string | null,
    lastError: data.last_error as string | null,
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
    .select("field_name,raw_value,normalized_value,confidence,extraction_method,page_number,claim_documents(original_name)")
    .eq("claim_id", claimId)
    .order("field_name", { ascending: true });
  if (error?.code === "PGRST205" || error?.code === "42P01") return [];
  if (error) throw new Error("Unable to load extracted claim fields.");
  return (data ?? []).map((row) => {
    const document = Array.isArray(row.claim_documents) ? row.claim_documents[0] : row.claim_documents;
    return {
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
