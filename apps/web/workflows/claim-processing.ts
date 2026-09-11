import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import { APICallError, generateText } from "ai";
import { createGoogle } from "@ai-sdk/google";
import mammoth from "mammoth";
import { classifyClaimDocument, extractClaimFields, type ClaimDocumentType, type RuleExtractedField } from "@/lib/extraction-rules";
import { transcribeLocally } from "@/lib/local-ocr";
import { createAdminClient } from "@/lib/supabase/admin";

type DocumentRow = {
  id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
};

type ExtractionResult = {
  fields: RuleExtractedField[];
  documents: DocumentExtraction[];
  claimedAmount: string | null;
  currency: string | null;
  warningCount: number;
  documentCount: number;
  pageCount: number;
};

type DocumentExtraction = {
  id: string;
  type: ClaimDocumentType;
  amount: string | null;
  currency: string | null;
  amountConfidence: number | null;
  includeInTotal: boolean;
  duplicateOf: string | null;
  status: "COMPLETED" | "NEEDS_CONFIRMATION";
  notes: string | null;
};

type ExtractionOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; reason: string };

const MAX_PAGES_PER_DOCUMENT = 20;
const EXTRACTION_TIMEOUT_MS = 25_000;
const OCR_TIMEOUT_MS = 60_000;
const DEFAULT_OCR_MODEL = "gemini-3.8-flash";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function transcribeWithGoogle(document: DocumentRow, bytes: Uint8Array) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("The optional Google OCR key is not configured.");
  }
  const google = createGoogle({ apiKey });
  const model = (process.env.CLAIM_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL).replace(/^google\//, "");
  try {
    const { text } = await generateText({
      model: google(model),
      abortSignal: AbortSignal.timeout(OCR_TIMEOUT_MS),
      maxOutputTokens: 12_000,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe every visible word, label, number, currency, and date from this claim document. Preserve reading order and line breaks. Do not calculate, infer, explain, or add markdown. Return only the transcription.",
          },
          { type: "file", data: bytes, mediaType: document.mime_type, filename: document.original_name },
        ],
      }],
    });
    return {
      text: text.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim(),
      confidence: null,
    };
  } catch (error) {
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 400 || error.statusCode === 401 || error.statusCode === 403) throw new Error("Google OCR authentication failed. Check the server-only Google AI Studio API key, then retry processing.");
      if (error.statusCode === 429) throw new Error("The free Google OCR quota is temporarily exhausted or rate limited. Wait and retry processing later.");
    }
    throw new Error(`OCR failed for ${document.original_name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function transcribeDocument(document: DocumentRow, bytes: Uint8Array) {
  const provider = process.env.CLAIM_OCR_PROVIDER?.trim().toLowerCase() || "local";
  if (provider === "google") {
    try {
      return await transcribeWithGoogle(document, bytes);
    } catch (error) {
      console.warn("[claim-processing] Google OCR unavailable; using local OCR", {
        documentId: document.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  try {
    return await transcribeLocally(document, bytes);
  } catch (error) {
    throw new Error(`Local OCR failed for ${document.original_name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function markStarted(jobId: string, claimId: string, actorId: string) {
  console.log("[claim-processing] starting", { jobId, claimId });
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: startedJob, error: jobError } = await admin
    .from("claim_processing_jobs")
    .update({ status: "RUNNING", started_at: now, attempt_count: 1, last_error: null })
    .eq("id", jobId)
    .eq("status", "QUEUED")
    .select("id")
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!startedJob) return { started: false, informationRequestId: null };
  const { data: informationRequest, error: informationError } = await admin
    .from("claim_information_requests")
    .select("id")
    .eq("claim_id", claimId)
    .eq("status", "RESPONDED")
    .order("responded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (informationError) throw new Error(informationError.message);
  const [{ error: claimError }, { error: auditError }] = await Promise.all([
    admin.from("claims").update({ status: "PROCESSING" }).eq("id", claimId),
    admin.from("audit_events").insert({ claim_id: claimId, actor_id: actorId, event_type: "PROCESSING_STARTED", metadata: { job_id: jobId, pipeline: "A", pipeline_version: "1.0.0" } }),
  ]);
  if (claimError || auditError) throw new Error(claimError?.message ?? auditError?.message);
  return { started: true, informationRequestId: informationRequest?.id as string | undefined ?? null };
}

async function extractDocuments(claimId: string): Promise<ExtractionOutcome> {
  console.log("[claim-processing] extracting documents", { claimId });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("claim_documents")
    .select("id,original_name,storage_path,mime_type")
    .eq("claim_id", claimId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not list claim documents: ${error.message}`);
  const documents = (data ?? []) as DocumentRow[];
  if (!documents.length) return { ok: false, reason: "No claim documents were found." };

  const texts: Array<{ document: DocumentRow; text: string; method: "pdf_text" | "docx_text" | "ocr"; sourceConfidence: number | null; fingerprint: string }> = [];
  const unreadableDocuments: Array<{ document: DocumentRow; reason: string }> = [];
  let pageCount = 0;
  for (const document of documents) {
    const { data: blob, error: downloadError } = await admin.storage.from("claim-documents").download(document.storage_path);
    if (downloadError || !blob) throw new Error(`Could not download ${document.original_name}: ${downloadError?.message ?? "empty file"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    let method: "pdf_text" | "docx_text" | "ocr" = "ocr";
    let sourceConfidence: number | null = 1;
    if (document.mime_type === "application/pdf") {
      const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
      if (pdf.numPages > MAX_PAGES_PER_DOCUMENT) return { ok: false, reason: `${document.original_name} exceeds the ${MAX_PAGES_PER_DOCUMENT}-page processing limit.` };
      const extracted = await Promise.race([
        extractText(pdf, { mergePages: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Text extraction timed out for ${document.original_name}.`)), EXTRACTION_TIMEOUT_MS)),
      ]);
      pageCount += extracted.totalPages;
      text = extracted.text.trim();
      if (text) method = "pdf_text";
    } else if (document.mime_type === DOCX_TYPE) {
      const extracted = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = extracted.value.trim();
      method = "docx_text";
      pageCount += 1;
    } else {
      pageCount += 1;
    }
    if (!text) {
      try {
        const transcription = await transcribeDocument(document, bytes);
        text = transcription.text;
        sourceConfidence = transcription.confidence;
      } catch (error) {
        unreadableDocuments.push({ document, reason: error instanceof Error ? error.message : "OCR could not read this document." });
      }
    }
    if (text) texts.push({ document, text, method, sourceConfidence, fingerprint: createHash("sha256").update(bytes).digest("hex") });
    else if (!unreadableDocuments.some((entry) => entry.document.id === document.id)) unreadableDocuments.push({ document, reason: "No readable text was found. Enter the document details manually." });
  }

  const perDocument = texts.map((entry) => {
    const parsed = extractClaimFields([{ documentId: entry.document.id, text: entry.text, method: entry.method, sourceConfidence: entry.sourceConfidence ?? undefined }]);
    const classification = classifyClaimDocument(entry.text);
    const amountField = parsed.fields.find((field) => field.fieldName === "claimed_amount")
      ?? parsed.fields.find((field) => field.fieldName === "invoice_total");
    return { entry, parsed, classification, amountField };
  });
  const fields = perDocument.flatMap((item) => item.parsed.fields);
  const documentsResult: DocumentExtraction[] = [];
  const seenFingerprints = new Map<string, string>();
  const seenReferences = new Map<string, string>();
  for (const item of perDocument) {
    const invoiceNumber = item.parsed.fields.find((field) => field.fieldName === "invoice_number")?.normalizedValue.trim().toLowerCase();
    const duplicateKey = invoiceNumber && item.amountField
      ? `${invoiceNumber}|${item.amountField.normalizedValue}|${item.parsed.currency ?? ""}`
      : null;
    const duplicateOf = seenFingerprints.get(item.entry.fingerprint) ?? (duplicateKey ? seenReferences.get(duplicateKey) : undefined) ?? null;
    seenFingerprints.set(item.entry.fingerprint, item.entry.document.id);
    if (duplicateKey) seenReferences.set(duplicateKey, item.entry.document.id);
    const amountConfidence = item.amountField?.confidence ?? null;
    const includeInTotal = Boolean(item.classification.payable && item.amountField && !duplicateOf);
    const needsConfirmation = !item.amountField || amountConfidence === null || amountConfidence <= 0.85 || item.classification.confidence <= 0.85 || Boolean(duplicateOf);
    documentsResult.push({
      id: item.entry.document.id,
      type: item.classification.type,
      amount: item.amountField?.normalizedValue ?? null,
      currency: item.parsed.currency,
      amountConfidence,
      includeInTotal,
      duplicateOf,
      status: needsConfirmation ? "NEEDS_CONFIRMATION" : "COMPLETED",
      notes: duplicateOf ? "Possible duplicate document; excluded from the proposed total." : !item.amountField ? "No payable amount was confidently detected." : null,
    });
  }
  for (const item of unreadableDocuments) {
    documentsResult.push({
      id: item.document.id,
      type: "UNKNOWN",
      amount: null,
      currency: null,
      amountConfidence: null,
      includeInTotal: false,
      duplicateOf: null,
      status: "NEEDS_CONFIRMATION",
      notes: item.reason.slice(0, 500),
    });
  }
  const payableDocuments = documentsResult.filter((document) => document.includeInTotal && document.amount);
  const currencies = new Set(payableDocuments.map((document) => document.currency).filter(Boolean));
  const claimedAmount = currencies.size <= 1 && payableDocuments.length
    ? payableDocuments.reduce((total, document) => total + Number(document.amount), 0).toFixed(2)
    : null;
  const currency = currencies.size === 1 ? [...currencies][0] ?? null : null;
  const conflicts = perDocument.reduce((total, item) => total + item.parsed.warningCount, 0);
  const warningCount = conflicts + documentsResult.filter((document) => document.status === "NEEDS_CONFIRMATION").length + (currencies.size > 1 ? 1 : 0);
  console.log("[claim-processing] extraction completed", { claimId, fieldCount: fields.length, documentCount: documents.length, pageCount });
  return { ok: true, result: {
      fields,
      documents: documentsResult,
      claimedAmount,
      currency,
      warningCount,
      documentCount: documents.length,
      pageCount,
    } };
}

async function saveCompleted(jobId: string, claimId: string, actorId: string, result: ExtractionResult, informationRequestId: string | null) {
  console.log("[claim-processing] saving completed result", { jobId, claimId, fieldCount: result.fields.length });
  const admin = createAdminClient();
  const rows = result.fields.map((field) => ({
    claim_id: claimId,
    document_id: field.documentId,
    field_name: field.fieldName,
    raw_value: field.rawValue,
    normalized_value: field.normalizedValue,
    confidence: field.confidence,
    extraction_method: field.method,
    page_number: field.pageNumber,
  }));
  const { error: clearError } = await admin.from("claim_extracted_fields").delete().eq("claim_id", claimId);
  if (clearError) throw new Error(`Could not replace extracted fields: ${clearError.message}`);
  if (rows.length) {
    const { error } = await admin.from("claim_extracted_fields").insert(rows);
    if (error) throw new Error(`Could not save extracted fields: ${error.message}`);
  }
  for (const document of result.documents) {
    const { error } = await admin.from("claim_documents").update({
      document_type: document.type,
      extracted_amount: document.amount,
      extracted_currency: document.currency,
      amount_confidence: document.amountConfidence,
      include_in_total: document.includeInTotal,
      duplicate_of: document.duplicateOf,
      extraction_status: document.status,
      extraction_notes: document.notes,
      extracted_at: new Date().toISOString(),
    }).eq("id", document.id).eq("claim_id", claimId);
    if (error) throw new Error(`Could not save document result: ${error.message}`);
  }
  const now = new Date().toISOString();
  const automationConfidence = result.fields.length ? result.fields.reduce((sum, field) => sum + field.confidence, 0) / result.fields.length : 0;
  const bestField = (name: string) => result.fields.filter((field) => field.fieldName === name).sort((left, right) => right.confidence - left.confidence)[0];
  const patientName = bestField("patient_name")?.normalizedValue;
  const providerName = bestField("provider_name")?.normalizedValue;
  const claimUpdate: { claimed_amount?: string | null; warning_count: number; status: "UPLOADED" | "REVIEW_REQUIRED"; currency?: string; patient_name?: string; provider_name?: string } = {
    warning_count: result.warningCount,
    status: informationRequestId ? "REVIEW_REQUIRED" : "UPLOADED",
    claimed_amount: result.claimedAmount,
  };
  if (result.claimedAmount) claimUpdate.claimed_amount = result.claimedAmount;
  if (result.currency) claimUpdate.currency = result.currency;
  if (patientName) claimUpdate.patient_name = patientName;
  if (providerName) claimUpdate.provider_name = providerName;
  const auditEvents: Array<{ claim_id: string; actor_id: string; event_type: string; metadata: Record<string, unknown> }> = [{
    claim_id: claimId,
    actor_id: actorId,
    event_type: "PROCESSING_COMPLETED",
    metadata: {
      job_id: jobId,
      field_count: rows.length,
      document_count: result.documentCount,
      page_count: result.pageCount,
      warning_count: result.warningCount,
      automation_confidence: automationConfidence,
      awaiting_client_confirmation: !informationRequestId,
      information_request_id: informationRequestId,
    },
  }];
  if (informationRequestId) auditEvents.push({
    claim_id: claimId,
    actor_id: actorId,
    event_type: "INFORMATION_PROCESSED",
    metadata: { information_request_id: informationRequestId, returned_to_review: true },
  });
  const informationUpdate = informationRequestId
    ? admin.from("claim_information_requests").update({ status: "COMPLETED", completed_at: now }).eq("id", informationRequestId).eq("status", "RESPONDED")
    : Promise.resolve({ error: null });
  const [{ error: claimError }, { error: jobError }, { error: auditError }, { error: informationError }] = await Promise.all([
    admin.from("claims").update(claimUpdate).eq("id", claimId),
    admin.from("claim_processing_jobs").update({ status: "COMPLETED", finished_at: now, last_error: null }).eq("id", jobId),
    admin.from("audit_events").insert(auditEvents),
    informationUpdate,
  ]);
  if (claimError || jobError || auditError || informationError) throw new Error(claimError?.message ?? jobError?.message ?? auditError?.message ?? informationError?.message);
}

async function saveFailed(jobId: string, claimId: string, actorId: string, reason: string) {
  console.error("[claim-processing] recording failure", { jobId, claimId, reason });
  const admin = createAdminClient();
  const safeReason = reason.slice(0, 1000);
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("claims").update({ status: "PROCESSING_FAILED" }).eq("id", claimId),
    admin.from("claim_processing_jobs").update({ status: "FAILED", last_error: safeReason, finished_at: now }).eq("id", jobId),
    admin.from("audit_events").insert({ claim_id: claimId, actor_id: actorId, event_type: "PROCESSING_FAILED", metadata: { job_id: jobId, reason: safeReason } }),
  ]);
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (typeof value.reason === "string" && value.reason.trim()) return value.reason;
    if (typeof value.error === "string" && value.error.trim()) return value.error;
    if (value.cause !== undefined) return errorMessage(value.cause);
    try {
      const serialized = JSON.stringify(value);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Fall through to the safe generic message.
    }
  }
  return "Processing failed without a readable error message. Check the server runtime logs.";
}

export async function processClaim(jobId: string, claimId: string, actorId: string) {
  const context = await markStarted(jobId, claimId, actorId);
  if (!context.started) return { status: "already-started" };
  try {
    const outcome = await extractDocuments(claimId);
    if (!outcome.ok) {
      await saveFailed(jobId, claimId, actorId, outcome.reason);
      return { status: "failed", reason: outcome.reason };
    }
    await saveCompleted(jobId, claimId, actorId, outcome.result, context.informationRequestId);
    return { status: "completed", fieldCount: outcome.result.fields.length };
  } catch (error) {
    const reason = errorMessage(error);
    await saveFailed(jobId, claimId, actorId, reason);
    return { status: "failed", reason };
  }
}
