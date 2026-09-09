import { verifyInternalOcrRequest } from "@/lib/internal-ocr-auth";
import { transcribeLocally } from "@/lib/local-ocr";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.text();
  const timestamp = request.headers.get("x-claimlens-timestamp") ?? "";
  const signature = request.headers.get("x-claimlens-signature") ?? "";

  try {
    if (!verifyInternalOcrRequest(body, timestamp, signature)) {
      return Response.json({ error: "Unauthorized OCR request." }, { status: 401 });
    }

    const parsed = JSON.parse(body) as { documentId?: unknown };
    if (typeof parsed.documentId !== "string" || !parsed.documentId) {
      return Response.json({ error: "A valid document ID is required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: document, error: documentError } = await admin
      .from("claim_documents")
      .select("id,original_name,storage_path,mime_type")
      .eq("id", parsed.documentId)
      .single();
    if (documentError || !document) {
      return Response.json({ error: `Could not load OCR document: ${documentError?.message ?? "not found"}` }, { status: 404 });
    }

    const { data: blob, error: downloadError } = await admin.storage
      .from("claim-documents")
      .download(document.storage_path);
    if (downloadError || !blob) {
      throw new Error(`Could not download ${document.original_name}: ${downloadError?.message ?? "empty file"}`);
    }

    const text = await transcribeLocally(document, new Uint8Array(await blob.arrayBuffer()));
    return Response.json({ text });
  } catch (error) {
    console.error("[internal-ocr] failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown local OCR error." },
      { status: 500 },
    );
  }
}
