import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { hasSupabaseConfig, isDemoMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!hasSupabaseConfig || isDemoMode) redirect("/login");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <main className="login-shell">
    <section className="login-brand">
      <div className="brand light"><span><Sparkles size={21} /></span>ClaimLens <b>AI</b></div>
      <div className="hero-copy"><div className="eyebrow"><ShieldCheck size={15} /> Secure client portal</div><h1>Start your claim.<br /><em>Track every step.</em></h1><p>Create a protected account, submit supporting documents, and follow your claim from intake through accountable human review.</p><div className="proof"><div><b>Private</b><span>account-scoped access</span></div><div><b>Traceable</b><span>audited decisions</span></div><div><b>Human</b><span>final verification</span></div></div></div>
      <p className="synthetic">Sensitive documents are protected by authenticated, role-based access.</p>
    </section>
    <section className="login-panel"><SignupForm /></section>
  </main>;
}
