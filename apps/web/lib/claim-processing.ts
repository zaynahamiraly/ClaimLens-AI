import "server-only";

import { start } from "workflow/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimProcessingWorkflow } from "@/workflows/claim-processing";

export async function enqueueClaimProcessing(claimId: string, actorId: string) {
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("claim_processing_jobs")
    .select("id,workflow_run_id,status")
    .eq("claim_id", claimId)
    .in("status", ["QUEUED", "RUNNING"])
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Could not check processing jobs: ${existingError.message}`);

  if (existing) return existing;

  const { data: job, error: jobError } = await admin
    .from("claim_processing_jobs")
    .insert({ claim_id: claimId, created_by: actorId, status: "QUEUED" })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(`Could not create processing job: ${jobError?.message ?? "unknown error"}`);

  try {
    const run = await start(claimProcessingWorkflow, [job.id as string, claimId, actorId]);
    const { error: updateError } = await admin
      .from("claim_processing_jobs")
      .update({ workflow_run_id: run.runId })
      .eq("id", job.id);
    if (updateError) throw updateError;
    return { id: job.id as string, workflow_run_id: run.runId, status: "QUEUED" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow could not be started.";
    await Promise.all([
      admin.from("claim_processing_jobs").update({ status: "FAILED", last_error: message, finished_at: new Date().toISOString() }).eq("id", job.id),
      admin.from("claims").update({ status: "PROCESSING_FAILED" }).eq("id", claimId),
      admin.from("audit_events").insert({ claim_id: claimId, actor_id: actorId, event_type: "PROCESSING_FAILED", metadata: { reason: message, stage: "enqueue" } }),
    ]);
    throw error;
  }
}
