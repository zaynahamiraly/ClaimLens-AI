import "server-only";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processClaim } from "@/workflows/claim-processing";

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

  after(() => processClaim(job.id as string, claimId, actorId));
  return { id: job.id as string, workflow_run_id: null, status: "QUEUED" };
}
