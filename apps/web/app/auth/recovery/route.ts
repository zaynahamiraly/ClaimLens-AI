import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  if (!tokenHash || tokenHash.length > 512) return NextResponse.redirect(new URL("/login?error=recovery", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (error) return NextResponse.redirect(new URL("/login?error=recovery", request.url));
  return NextResponse.redirect(new URL("/update-password", request.url));
}
