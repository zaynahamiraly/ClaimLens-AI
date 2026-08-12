const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function getSupabaseConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured. Add the required environment variables.");
  }

  return { url: supabaseUrl, publishableKey: supabaseKey };
}
