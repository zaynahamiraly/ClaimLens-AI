"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/config";

const MAX_FILE_SIZE = 6 * 1024 * 1024;
const MAX_FILES = 3;
const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);

const claimSchema = z.object({
  patientName: z.string().trim().min(2, "Enter the patient name.").max(120),
  providerName: z.string().trim().min(2, "Enter the provider name.").max(160),
});

export type ClaimFormState = { error?: string; fieldErrors?: { patientName?: string[]; providerName?: string[] } };

async function hasValidSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf") return bytes.slice(0, 4).every((byte, index) => byte === [0x25, 0x50, 0x44, 0x46][index]);
  if (file.type === "image/png") return bytes.slice(0, 8).every((byte, index) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function safeFilename(filename: string) {
  return filename.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export async function createClaim(_state: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const viewer = await requireViewer();
  const parsed = claimSchema.safeParse({ patientName: formData.get("patientName"), providerName: formData.get("providerName") });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const files = formData.getAll("documents").filter((value): value is File => value instanceof File && value.size > 0);
  if (files.length < 1 || files.length > MAX_FILES) return { error: `Upload between 1 and ${MAX_FILES} documents.` };
  for (const file of files) {
    if (!allowedTypes.has(file.type) || file.size > MAX_FILE_SIZE || !(await hasValidSignature(file))) {
      return { error: `${file.name} is not a valid PDF, PNG, or JPEG under 6 MB.` };
    }
  }

  if (isDemoMode) redirect("/claims?created=1");

  const supabase = await createClient();
  const reference = `CLM-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  const { data: claim, error: claimError } = await supabase.from("claims").insert({
    reference, created_by: viewer.id, patient_name: parsed.data.patientName,
    provider_name: parsed.data.providerName, status: "PROCESSING",
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

  revalidatePath("/dashboard");
  revalidatePath("/claims");
  redirect("/claims?created=1");
}

export async function verifyClaim(reference: string) {
  await requireViewer();
  if (isDemoMode) redirect(`/claims/${reference}/review?verified=1`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_claim", { p_reference: reference });
  if (error) throw new Error("Claim verification failed.");
  revalidatePath("/dashboard");
  revalidatePath("/claims");
  revalidatePath(`/claims/${reference}/review`);
  redirect(`/claims/${reference}/review?verified=1`);
}
