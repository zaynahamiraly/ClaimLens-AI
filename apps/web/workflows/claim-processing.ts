import { extractText, getDocumentProxy } from "unpdf";
import { APICallError, generateText } from "ai";
import mammoth from "mammoth";
import { extractClaimFields, type RuleExtractedField } from "@/lib/extraction-rules";
import { createAdminClient } from "@/lib/supabase/admin";

type DocumentRow = {
  id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
};

type ExtractionResult = {
  fields: RuleExtractedField[];
  claimedAmount: string;
  currency: string | null;
  warningCount: number;
  documentCount: number;
  pageCount: number;
};

type ExtractionOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; reason: string };

const MAX_PAGES_PER_DOCUMENT = 20;
const EXTRACTION_TIMEOUT_MS = 25_000;
const OCR_TIMEOUT_MS = 60_000;
const DEFAULT_OCR_MODEL = "google/gemini-3.8-flash";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function transcribeDocument(document: DocumentRow, bytes: Uint8Array) {
  const model = process.env.CLAIM_OCR_MODEL?.trim() || DEFAULT_OCR_MODEL;
  try {
    const { text } = await generateText({
      model,
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
      providerOptions: { gateway: { user: document.id, tags: ["feature:claim-ocr"] } },
    });
    return text.replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim();
  } catch (error) {
    if (error instanceof Error && error.name === "GatewayAuthenticationError") throw new Error("OCR authentication failed. Enable AI Gateway for this Vercel project, then retry processing.");
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401 || error.statusCode === 403) throw new Error("OCR authentication failed. Enable AI Gateway for this Vercel project, then retry processing.");
      if (error.statusCode === 402) throw new Error("The OCR budget is exhausted. Add AI Gateway credits, then retry processing.");
      if (error.statusCode === 429) throw new Error("The OCR provider is temporarily rate limited. Wait briefly, then retry processing.");
    }
    throw new Error(`OCR failed for ${document.original_name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function markStarted(jobId: string, claimId: string, actorId: string) {
  "use step";
  console.log("[claim-processing] starting", { jobId, claimId });
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [{ error: jobError }, { error: claimError }, { error: auditError }] = await Promise.all([
    admin.from("claim_processing_jobs").update({ status: "RUNNING", started_at: now, attempt_count: 1, last_error: null }).eq("id", jobId),
    admin.from("claims").update({ status: "PROCESSING" }).eq("id", claimId),
    admin.from("audit_events").insert({ claim_id: claimId, actor_id: actorId, event_type: "PROCESSING_STARTED", metadata: { job_id: jobId, pipeline: "A", pipeline_version: "1.0.0" } }),
  ]);
  if (jobError || claimError || auditError) throw new Error(jobError?.message ?? claimError?.message ?? auditError?.message);
}

async function extractDocuments(claimId: string): Promise<ExtractionOutcome> {
  "use step";
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

  const texts: Array<{ document: DocumentRow; text: string; method: "pdf_text" | "docx_text" | "ocr" }> = [];
  let pageCount = 0;
  for (const document of documents) {
    const { data: blob, error: downloadError } = await admin.storage.from("claim-documents").download(document.storage_path);
    if (downloadError || !blob) throw new Error(`Could not download ${document.original_name}: ${downloadError?.message ?? "empty file"}`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    let method: "pdf_text" | "docx_text" | "ocr" = "ocr";
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
    if (!text) text = await transcribeDocument(document, bytes);
    if (text) texts.push({ document, text, method });
  }
  if (!texts.length) return { ok: false, reason: "No readable text could be extracted from the uploaded documents." };

  const parsed = extractClaimFields(texts.map((entry) => ({ documentId: entry.document.id, text: entry.text, method: entry.method })));
  const claimedAmount = parsed.claimedAmount;
  if (!claimedAmount) return { ok: false, reason: "Machine-readable text was found, but no credible monetary total could be inferred from the document structure." };
  console.log("[claim-processing] extraction completed", { claimId, fieldCount: parsed.fields.length, documentCount: documents.length, pageCount });
  return { ok: true, result: {
      fields: parsed.fields,
      claimedAmount,
      currency: parsed.currency,
      warningCount: parsed.warningCount,
      documentCount: documents.length,
      pageCount,
    } };
}

async function saveCompleted(jobId: string, claimId: string, actorId: string, result: ExtractionResult) {
  "use step";
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
  if (rows.length) {
    const { error } = await admin.from("claim_extracted_fields").upsert(rows, { onConflict: "claim_id,field_name" });
    if (error) throw new Error(`Could not save extracted fields: ${error.message}`);
  }
  const now = new Date().toISOString();
  const claimUpdate: { claimed_amount: string; warning_count: number; status: "REVIEW_REQUIRED"; currency?: string } = {
    claimed_amount: result.claimedAmount,
    warning_count: result.warningCount,
    status: "REVIEW_REQUIRED",
  };
  if (result.currency) claimUpdate.currency = result.currency;
  const [{ error: claimError }, { error: jobError }, { error: auditError }] = await Promise.all([
    admin.from("claims").update(claimUpdate).eq("id", claimId),
    admin.from("claim_processing_jobs").update({ status: "COMPLETED", finished_at: now, last_error: null }).eq("id", jobId),
    admin.from("audit_events").insert({ claim_id: claimId, actor_id: actorId, event_type: "PROCESSING_COMPLETED", metadata: { job_id: jobId, field_count: rows.length, document_count: result.documentCount, page_count: result.pageCount, warning_count: result.warningCount } }),
  ]);
  if (claimError || jobError || auditError) throw new Error(claimError?.message ?? jobError?.message ?? auditError?.message);
}

async function saveFailed(jobId: string, claimId: string, actorId: string, reason: string) {
  "use step";
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
    if (value.cause !== undefined) return errorMessage(value.cause);
    try {
      const serialized = JSON.stringify(value);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Fall through to the safe generic message.
    }
  }
  return "Processing failed without a readable error message. Check the workflow runtime logs.";
}

export async function claimProcessingWorkflow(jobId: string, claimId: string, actorId: string) {
  "use workflow";
  await markStarted(jobId, claimId, actorId);
  try {
    const outcome = await extractDocuments(claimId);
    if (!outcome.ok) {
      await saveFailed(jobId, claimId, actorId, outcome.reason);
      return { status: "failed", reason: outcome.reason };
    }
    await saveCompleted(jobId, claimId, actorId, outcome.result);
    return { status: "completed", fieldCount: outcome.result.fields.length };
  } catch (error) {
    const reason = errorMessage(error);
    await saveFailed(jobId, claimId, actorId, reason);
    return { status: "failed", reason };
  }
}
