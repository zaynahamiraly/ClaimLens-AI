import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processClaim } from "@/workflows/claim-processing";

const STALE_JOB_AFTER_MS = 6 * 60 * 1_000;

export async function enqueueClaimProcessing(claimId: string, actorId: string) {
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_JOB_AFTER_MS).toISOString();
  const { error: staleError } = await admin
    .from("claim_processing_jobs")
    .update({
      status: "FAILED",
      last_error: "The previous background process stopped unexpectedly. Retry processing.",
      finished_at: new Date().toISOString(),
    })
    .eq("claim_id", claimId)
    .in("status", ["QUEUED", "RUNNING"])
    .lt("created_at", staleBefore);
  if (staleError) throw new Error(`Could not recover abandoned processing jobs: ${staleError.message}`);

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

  after(() => processClaim(job.id as string, claimId, actorId));
  return { id: job.id as string, workflow_run_id: null, status: "QUEUED" };
}
