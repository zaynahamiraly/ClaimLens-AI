import { hasSupabaseConfig, isDemoMode } from "@/lib/config";

export function GET() {
  return Response.json({
    status: hasSupabaseConfig || isDemoMode ? "healthy" : "configuration_required",
    service: "claimlens-web",
    database: hasSupabaseConfig ? "configured" : "not_configured",
    demoMode: isDemoMode,
  }, { status: hasSupabaseConfig || isDemoMode ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
