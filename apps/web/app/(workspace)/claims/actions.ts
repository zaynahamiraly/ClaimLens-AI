"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole, requireViewer } from "@/lib/auth";
import { enqueueClaimProcessing } from "@/lib/claim-processing";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";
import type { ClaimWorkflowState, VerificationState } from "@/lib/types";

const MAX_FILE_SIZE = 6 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_PACKAGE_SIZE = 18 * 1024 * 1024;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg", DOCX_TYPE]);

const decisionSchema = z.object({
  outcome: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().trim().min(5, "Enter at least 5 characters of decision notes.").max(2000),
  approvedAmount: z.string().trim(),
}).superRefine((value, context) => {
  if (value.outcome !== "APPROVED") return;
  const amount = Number(value.approvedAmount);
  if (!value.approvedAmount || !Number.isFinite(amount) || amount <= 0) {
    context.addIssue({ code: "custom", path: ["approvedAmount"], message: "Enter a valid approved amount." });
  }
});

const settlementSchema = z.object({
  status: z.enum(["PAYMENT_PENDING", "PAID"]),
});

const identityCorrectionSchema = z.object({
  patientName: z.string().trim().min(2).max(120),
  providerName: z.string().trim().min(2).max(160),
});

export type ClaimFormState = { error?: string };
export type IdentityCorrectionState = { success?: boolean; error?: string };
export type ClaimConfirmationState = { error?: string };

function revalidateClaimWorkflow(reference: string) {
  revalidatePath("/dashboard");
  revalidatePath("/claims");
  revalidatePath("/review-queue");
  revalidatePath("/analytics");
  revalidatePath("/audit");
  revalidatePath(`/claims/${reference}`);
  revalidatePath(`/claims/${reference}/review`);
}

async function hasValidSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf") return bytes.slice(0, 4).every((byte, index) => byte === [0x25, 0x50, 0x44, 0x46][index]);
  if (file.type === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  if (file.type === DOCX_TYPE) return file.name.toLowerCase().endsWith(".docx") && bytes[0] === 0x50 && bytes[1] === 0x4b;
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function safeFilename(filename: string) {
  return filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export async function createClaim(_state: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const viewer = await requireViewer();
  const files = formData.getAll("documents").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length < 1 || files.length > MAX_FILES) return { error: `Upload between 1 and ${MAX_FILES} documents.` };
  if (files.reduce((total, file) => total + file.size, 0) > MAX_PACKAGE_SIZE) return { error: "The complete claim package must be under 18 MB." };
  for (const file of files) {
    if (!allowedTypes.has(file.type) || file.size > MAX_FILE_SIZE || !(await hasValidSignature(file))) {
      return { error: `${file.name} is not a valid PDF, PNG, JPEG, or DOCX under 6 MB.` };
    }
  }

  if (isDemoMode) redirect("/claims?created=1");

  const supabase = await createClient();
  const reference = `CLM-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const { data: claim, error: claimError } = await supabase.from("claims").insert({
    reference, created_by: viewer.id, patient_name: "",
    provider_name: "", status: "PROCESSING",
    client_id: viewer.role === "client" ? viewer.id : null,
  }).select("id").single();
  if (claimError || !claim) return { error: "Could not create the claim. Please try again." };

  const uploadedPaths: string[] = [];
  try {
    for (const file of files) {
      const path = `${viewer.id}/${claim.id}/${randomUUID()}-${safeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("claim-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      const { error: documentError } = await supabase.from("claim_documents").insert({
        claim_id: claim.id, uploaded_by: viewer.id, document_type: "UNKNOWN", original_name: file.name,
        storage_path: path, mime_type: file.type, size_bytes: file.size,
      });
      if (documentError) throw documentError;
    }
    const { error: auditError } = await supabase.from("audit_events").insert({
      claim_id: claim.id,
      actor_id: viewer.id,
      event_type: "CLAIM_CREATED",
      metadata: { document_count: files.length },
    });
    if (auditError) throw auditError;
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("claim-documents").remove(uploadedPaths);
    await supabase.from("claims").delete().eq("id", claim.id);
    console.error("[createClaim] compensated failed upload", { claimId: claim.id, error: String(error) });
    return { error: "The documents could not be uploaded. No partial claim was retained." };
  }

  try {
    await enqueueClaimProcessing(claim.id, viewer.id);
  } catch (error) {
    console.error("[createClaim] processing enqueue failed", { claimId: claim.id, error: String(error) });
  }

  revalidatePath("/dashboard");
  revalidatePath("/claims");
  redirect(`/claims/${reference}`);
}

export async function confirmClaim(
  reference: string,
  _state: ClaimConfirmationState,
  formData: FormData,
): Promise<ClaimConfirmationState> {
  void _state;
  const viewer = await requireRole(["client"]);
  const patientName = formData.get("patientName")?.toString().trim() ?? "";
  const providerName = formData.get("providerName")?.toString().trim() ?? "";
  if (patientName.length < 2 || providerName.length < 2) return { error: "Confirm the patient and provider names." };
  if (isDemoMode) redirect(`/claims/${reference}?submitted=1`);

  const supabase = await createClient();
  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id,status,client_id")
    .eq("reference", reference)
    .maybeSingle();
  if (claimError || !claim || claim.client_id !== viewer.id || claim.status !== "UPLOADED") {
    return { error: "This claim is not available for confirmation." };
  }
  const { data: documents, error: documentError } = await supabase
    .from("claim_documents")
    .select("id")
    .eq("claim_id", claim.id);
  if (documentError || !documents?.length) return { error: "The uploaded documents could not be loaded." };

  const payload = [];
  for (const document of documents) {
    const include = formData.get(`include-${document.id}`) === "on";
    const amount = formData.get(`amount-${document.id}`)?.toString().trim() ?? "";
    const currency = formData.get(`currency-${document.id}`)?.toString().trim().toUpperCase() ?? "";
    if (include && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) {
      return { error: "Enter a valid positive amount for every included document." };
    }
    if (include && !["MUR", "UGX", "KES", "TZS", "USD", "EUR", "GBP"].includes(currency)) {
      return { error: "Select a valid currency for every included document." };
    }
    payload.push({ id: document.id, include, amount: include ? amount : null, currency: include ? currency : null });
  }
  const included = payload.filter((document) => document.include);
  if (!included.length) return { error: "Include at least one receipt, bill, memo, or other document with an expense amount." };
  if (new Set(included.map((document) => document.currency)).size > 1) return { error: "A single claim cannot combine different currencies." };

  const { error } = await supabase.rpc("confirm_claim", {
    p_reference: reference,
    p_patient_name: patientName,
    p_provider_name: providerName,
    p_documents: payload,
  });
  if (error) {
    console.error("[confirmClaim] confirmation failed", { reference, error: error.message });
    return { error: error.code === "PGRST202" ? "Apply the multi-document confirmation migration in Supabase first." : error.message };
  }
  revalidateClaimWorkflow(reference);
  redirect(`/claims/${reference}?submitted=1`);
}

export async function retryClaimProcessing(reference: string) {
  const viewer = await requireViewer();
  if (isDemoMode) redirect(`/claims/${reference}`);

  const supabase = await createClient();
  const { data: claim, error } = await supabase
    .from("claims")
    .select("id,status")
    .eq("reference", reference)
    .maybeSingle();
  if (error || !claim) throw new Error("Claim is not available for processing.");
  if (!(["UPLOADED", "PROCESSING", "PROCESSING_FAILED"] as string[]).includes(claim.status)) {
    throw new Error("Only pending or failed claims can be processed.");
  }

  await enqueueClaimProcessing(claim.id as string, viewer.id);
  revalidatePath("/dashboard");
  revalidatePath("/claims");
  revalidatePath(`/claims/${reference}`);
  redirect(`/claims/${reference}`);
}

export async function verifyClaim(
  reference: string,
  _previousState: VerificationState,
  _formData: FormData,
): Promise<VerificationState> {
  void _previousState;
  void _formData;
  await requireRole(["claims_officer", "supervisor", "administrator"]);
  if (isDemoMode) return { success: true };
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_claim", { p_reference: reference });
  if (error) {
    console.error("[verifyClaim] verification failed", { reference, error: error.message });
    return { error: "Claim verification failed. Please try again." };
  }
  revalidateClaimWorkflow(reference);
  return { success: true };
}

export async function correctClaimIdentity(
  reference: string,
  _previousState: IdentityCorrectionState,
  formData: FormData,
): Promise<IdentityCorrectionState> {
  void _previousState;
  const viewer = await requireRole(["claims_officer", "supervisor", "administrator"]);
  const parsed = identityCorrectionSchema.safeParse({
    patientName: formData.get("patientName")?.toString(),
    providerName: formData.get("providerName")?.toString(),
  });
  if (!parsed.success) return { error: "Confirm a valid patient and provider name." };
  if (isDemoMode) return { success: true };

  const supabase = await createClient();
  const { data: claim, error: claimError } = await supabase
    .from("claims")
    .select("id,status,assigned_to")
    .eq("reference", reference)
    .maybeSingle();
  if (claimError || !claim || claim.status !== "REVIEW_REQUIRED") {
    return { error: "Corrections can only be saved during human review." };
  }
  if (viewer.role === "claims_officer" && claim.assigned_to !== viewer.id) {
    return { error: claim.assigned_to ? "This claim is assigned to another officer." : "Assign this claim to yourself before saving corrections." };
  }
  const { data: documents, error: documentsError } = await supabase.from("claim_documents").select("id").eq("claim_id", claim.id);
  if (documentsError || !documents?.length) return { error: "The claim documents could not be loaded." };
  const payload = [];
  for (const document of documents) {
    const include = formData.get(`include-${document.id}`) === "on";
    const amount = formData.get(`amount-${document.id}`)?.toString().trim() ?? "";
    const currency = formData.get(`currency-${document.id}`)?.toString().trim().toUpperCase() ?? "";
    if (include && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) return { error: "Enter a positive amount for every included document." };
    if (include && !["MUR", "UGX", "KES", "TZS", "USD", "EUR", "GBP"].includes(currency)) return { error: "Select a currency for every included document." };
    payload.push({ id: document.id, include, amount: include ? amount : null, currency: include ? currency : null });
  }
  const included = payload.filter((document) => document.include);
  if (!included.length) return { error: "Include at least one document in the claim total." };
  if (new Set(included.map((document) => document.currency)).size > 1) return { error: "Separate different currencies into different claims." };
  const { error: updateError } = await supabase.rpc("correct_claim_package", {
    p_reference: reference,
    p_patient_name: parsed.data.patientName,
    p_provider_name: parsed.data.providerName,
    p_documents: payload,
  });
  if (updateError) {
    console.error("[correctClaimIdentity] package correction failed", { reference, code: updateError.code, error: updateError.message });
    return { error: updateError.code === "PGRST202" ? "Apply the transactional staff-corrections migration in Supabase first." : updateError.message };
  }
  revalidateClaimWorkflow(reference);
  return { success: true };
}

export async function claimForReview(reference: string) {
  const viewer = await requireRole(["claims_officer"]);
  if (isDemoMode) redirect(`/claims/${reference}/review`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_claim", { p_reference: reference, p_assignee: viewer.id });
  if (error) throw new Error(error.message.includes("available") ? "This claim has already been assigned." : "The claim could not be assigned.");
  revalidateClaimWorkflow(reference);
  redirect(`/claims/${reference}/review`);
}

export async function decideClaim(
  reference: string,
  _previousState: ClaimWorkflowState,
  formData: FormData,
): Promise<ClaimWorkflowState> {
  void _previousState;
  await requireRole(["supervisor", "administrator"]);
  const parsed = decisionSchema.safeParse({
    outcome: formData.get("outcome"),
    notes: formData.get("notes"),
    approvedAmount: formData.get("approvedAmount"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the decision details." };
  if (isDemoMode) return { success: true };

  const supabase = await createClient();
  const approvedAmount = parsed.data.outcome === "APPROVED" ? Number(parsed.data.approvedAmount) : null;
  const { error } = await supabase.rpc("decide_claim", {
    p_reference: reference,
    p_outcome: parsed.data.outcome,
    p_notes: parsed.data.notes,
    p_approved_amount: approvedAmount,
  });
  if (error) {
    console.error("[decideClaim] decision failed", { reference, error: error.message });
    const expectedMessage = error.message.includes("Approved amount") || error.message.includes("Only a verified claim")
      ? error.message
      : null;
    return { error: error.code === "PGRST202" ? "Apply the claim-decision migrations in Supabase first." : expectedMessage ?? "The claim decision could not be saved." };
  }
  revalidateClaimWorkflow(reference);
  return { success: true };
}

export async function advanceClaimSettlement(
  reference: string,
  _previousState: ClaimWorkflowState,
  formData: FormData,
): Promise<ClaimWorkflowState> {
  void _previousState;
  await requireRole(["supervisor", "administrator"]);
  const parsed = settlementSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success) return { error: "Select a valid settlement step." };
  if (isDemoMode) return { success: true };

  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_claim_settlement", {
    p_reference: reference,
    p_status: parsed.data.status,
  });
  if (error) {
    console.error("[advanceClaimSettlement] transition failed", { reference, error: error.message });
    return { error: error.code === "PGRST202" ? "Apply the claim-decision migrations in Supabase first." : "The settlement status could not be updated." };
  }
  revalidateClaimWorkflow(reference);
  return { success: true };
}

export async function assignClaim(reference: string, formData?: FormData) {
  const viewer = await requireRole(["claims_officer", "supervisor", "administrator"]);
  if (isDemoMode) redirect(`/claims/${reference}`);
  const requested = formData?.get("assignee");
  const assignee = viewer.role === "claims_officer"
    ? viewer.id
    : typeof requested === "string" && z.uuid().safeParse(requested).success
      ? requested
      : null;
  if (!assignee) throw new Error("Select an active claims officer.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_claim", { p_reference: reference, p_assignee: assignee });
  if (error) throw new Error("Claim assignment failed.");
  revalidatePath("/dashboard");
  revalidatePath("/claims");
  revalidatePath(`/claims/${reference}`);
  redirect(`/claims/${reference}`);
}
