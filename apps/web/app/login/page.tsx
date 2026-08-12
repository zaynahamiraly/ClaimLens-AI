import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (hasSupabaseConfig && !isDemoMode) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }
  const { next } = await searchParams;

  return <main className="login-shell">
    <section className="login-brand">
      <div className="brand light"><span><Sparkles size={21} /></span>ClaimLens <b>AI</b></div>
      <div className="hero-copy"><div className="eyebrow"><ShieldCheck size={15} /> Evidence-grounded claims review</div><h1>Every claim.<br /><em>Clearly understood.</em></h1><p>Turn complex health claim documents into structured, traceable decisions—with AI that always shows its work.</p><div className="proof"><div><b>12</b><span>fields extracted</span></div><div><b>40ms</b><span>pilot processing</span></div><div><b>100%</b><span>golden case</span></div></div></div>
      <p className="synthetic">Synthetic data only · Built for accountable, human-led decisions.</p>
    </section>
    <section className="login-panel"><LoginForm demoMode={isDemoMode} configured={hasSupabaseConfig} next={next} /></section>
  </main>;
}
