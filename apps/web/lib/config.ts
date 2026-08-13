const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function getSupabaseConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured. Add the required environment variables.");
  }

  return { url: supabaseUrl, publishableKey: supabaseKey };
}

export function getSupabaseAdminConfig() {
  const config = getSupabaseConfig();
  if (!supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY is required for administrator operations.");
  }
  return { url: config.url, secretKey: supabaseSecretKey };
}
